import importlib.util
import pathlib
import unittest

from PIL import Image


WORKER_PATH = pathlib.Path(__file__).resolve().parents[1] / "services" / "sd_worker.py"
SPEC = importlib.util.spec_from_file_location("sd_worker_under_test", WORKER_PATH)
sd_worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sd_worker)


class FakePipe:
    def __init__(self, pipeline_name):
        self.pipeline_name = pipeline_name
        self.calls = []

    def enable_attention_slicing(self):
        pass

    def enable_vae_slicing(self):
        pass

    def enable_xformers_memory_efficient_attention(self):
        pass

    def to(self, device):
        self.device = device
        return self


class FakePipelineClass:
    def __init__(self, pipeline_name):
        self.pipeline_name = pipeline_name
        self.calls = []

    def from_single_file(self, checkpoint, **kwargs):
        self.calls.append(("from_single_file", checkpoint, kwargs))
        return FakePipe(self.pipeline_name)

    def from_pretrained(self, checkpoint, **kwargs):
        self.calls.append(("from_pretrained", checkpoint, kwargs))
        return FakePipe(self.pipeline_name)


class SdWorkerLoaderTests(unittest.TestCase):
    def setUp(self):
        self.originals = {}
        for name in (
            "diffusers",
            "AutoPipelineForText2Image",
            "StableDiffusionPipeline",
            "StableDiffusionXLPipeline",
            "StableDiffusionImg2ImgPipeline",
            "StableDiffusionXLImg2ImgPipeline",
            "StableDiffusionInpaintPipeline",
            "StableDiffusionXLInpaintPipeline",
            "get_dtype",
            "get_device",
            "resolve_original_config",
            "resolve_local_diffusers_config",
        ):
            self.originals[name] = getattr(sd_worker, name)

        sd_worker.diffusers = object()
        sd_worker.AutoPipelineForText2Image = object()
        sd_worker.StableDiffusionPipeline = FakePipelineClass("SD15_TXT2IMG")
        sd_worker.StableDiffusionXLPipeline = FakePipelineClass("SDXL_TXT2IMG")
        sd_worker.StableDiffusionImg2ImgPipeline = FakePipelineClass("SD15_IMG2IMG")
        sd_worker.StableDiffusionXLImg2ImgPipeline = FakePipelineClass("SDXL_IMG2IMG")
        sd_worker.StableDiffusionInpaintPipeline = FakePipelineClass("SD15_INPAINT")
        sd_worker.StableDiffusionXLInpaintPipeline = FakePipelineClass("SDXL_INPAINT")
        sd_worker.get_dtype = lambda: "float32"
        sd_worker.get_device = lambda: "cpu"
        sd_worker.resolve_original_config = lambda checkpoint, architecture, mode: None
        sd_worker.resolve_local_diffusers_config = lambda architecture: None

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(sd_worker, name, value)

    def test_sdxl_img2img_safetensors_uses_explicit_pipeline(self):
        pipe = sd_worker.create_pipeline(
            "normal-sdxl.safetensors",
            "sdxl",
            "img2img",
            {"supportsNativeInpaint": False, "unetInChannels": 4},
        )

        self.assertEqual(pipe.pipeline_name, "SDXL_IMG2IMG")
        method, checkpoint, kwargs = sd_worker.StableDiffusionXLImg2ImgPipeline.calls[-1]
        self.assertEqual(method, "from_single_file")
        self.assertEqual(checkpoint, "normal-sdxl.safetensors")
        self.assertTrue(kwargs["use_safetensors"])
        self.assertTrue(kwargs["local_files_only"])

    def test_sd15_img2img_safetensors_uses_explicit_pipeline(self):
        pipe = sd_worker.create_pipeline(
            "normal-sd15.safetensors",
            "sd15",
            "img2img",
            {"supportsNativeInpaint": False, "unetInChannels": 4},
        )

        self.assertEqual(pipe.pipeline_name, "SD15_IMG2IMG")
        method, _, kwargs = sd_worker.StableDiffusionImg2ImgPipeline.calls[-1]
        self.assertEqual(method, "from_single_file")
        self.assertFalse(kwargs["requires_safety_checker"])

    def test_native_inpaint_uses_architecture_specific_pipeline(self):
        sdxl_pipe = sd_worker.create_pipeline(
            "native-sdxl-inpaint.safetensors",
            "sdxl",
            "inpaint",
            {"supportsNativeInpaint": True, "unetInChannels": 9},
        )
        sd15_pipe = sd_worker.create_pipeline(
            "native-sd15-inpaint.safetensors",
            "sd15",
            "inpaint",
            {"supportsNativeInpaint": True, "unetInChannels": 9},
        )

        self.assertEqual(sdxl_pipe.pipeline_name, "SDXL_INPAINT")
        self.assertEqual(sd15_pipe.pipeline_name, "SD15_INPAINT")
        self.assertEqual(sd_worker.StableDiffusionXLInpaintPipeline.calls[-1][0], "from_single_file")
        self.assertEqual(sd_worker.StableDiffusionInpaintPipeline.calls[-1][0], "from_single_file")

    def test_non_native_sdxl_inpaint_falls_back_to_masked_img2img(self):
        pipe = sd_worker.create_pipeline(
            "normal-sdxl.safetensors",
            "sdxl",
            "inpaint",
            {"supportsNativeInpaint": False, "unetInChannels": 4},
        )

        self.assertEqual(pipe.pipeline_name, "SDXL_IMG2IMG")
        self.assertEqual(pipe._kit_effective_mode, "img2img")
        self.assertTrue(pipe._kit_inpaint_fallback)

    def test_compose_inpaint_result_preserves_pixels_outside_mask(self):
        init_image = Image.new("RGB", (2, 2), (0, 0, 0))
        generated = Image.new("RGB", (2, 2), (255, 255, 255))
        mask = Image.new("L", (2, 2), 0)
        mask.putpixel((1, 1), 255)

        result = sd_worker.compose_inpaint_result(
            generated,
            {
                "init_image": init_image,
                "compose_mask": mask,
                "inpaint_area": "only_masked",
            },
        )

        self.assertEqual(result.size, init_image.size)
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0))
        self.assertEqual(result.getpixel((1, 1)), (255, 255, 255))

    def test_output_modes_are_normalized(self):
        self.assertEqual(sd_worker.normalize_inpaint_output_mode(None), "new_full_layer")
        self.assertEqual(sd_worker.normalize_inpaint_output_mode("patch"), "patch_layer")
        self.assertEqual(sd_worker.normalize_inpaint_output_mode("replaceSelected"), "replace_original")

    def test_wrapped_pipeline_call_accepts_progress_callback_kwargs(self):
        def wrapped_call(**kwargs):
            return kwargs

        self.assertTrue(sd_worker.supports_parameter(wrapped_call, "callback_on_step_end"))


if __name__ == "__main__":
    unittest.main()
