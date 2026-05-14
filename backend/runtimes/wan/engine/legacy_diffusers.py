def run_diffusers_wan(_payload, _logger):
    raise RuntimeError(
        "WAN_RUNTIME_UNSUPPORTED: diffusers esta desativado para este fluxo. "
        "Use VIDEO_WAN_RUNTIME=kit_wan_legacy com runtime interno validado."
    )
