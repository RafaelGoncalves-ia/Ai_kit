class WanScheduler:
    def __init__(self, sampler="euler_ancestral", scheduler="beta", shift=8):
        self.sampler = sampler or "euler_ancestral"
        self.scheduler = scheduler or "beta"
        self.shift = float(shift or 8)

    def to_dict(self):
        return {
            "sampler": self.sampler,
            "scheduler": self.scheduler,
            "shift": self.shift,
        }
