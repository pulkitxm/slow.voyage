import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))

with open(os.path.join(ROOT, "src", "game", "car-sheets.json"), encoding="utf-8") as source:
    SHEETS = json.load(source)


def tyre(size):
    road = re.fullmatch(r"(\d+)/(\d+)R(\d+)", size)
    if road:
        width, aspect, rim = (int(part) for part in road.groups())
        rim_radius = rim * 0.0254 / 2
        return {"radius": rim_radius + width * aspect / 100000, "width": width / 1000, "rim": rim_radius}
    race = re.fullmatch(r"(\d+)x(\d+)R(\d+)", size)
    if not race:
        raise ValueError(f"unreadable tyre size {size}")
    diameter, width, rim = (int(part) for part in race.groups())
    return {"radius": diameter / 2000, "width": width / 1000, "rim": rim * 0.0254 / 2}


class Sheet:
    def __init__(self, name, data=None):
        data = data or SHEETS[name]
        self.name = name
        self.length = data["length"] / 1000
        self.width = data["width"] / 1000
        self.height = data["height"] / 1000
        self.wheelbase = data["wheelbase"] / 1000
        self.front_overhang = data["frontOverhang"] / 1000
        self.track_front = data["track"][0] / 1000
        self.track_rear = data["track"][1] / 1000
        self.tyre_front = tyre(data["tyres"][0])
        self.tyre_rear = tyre(data["tyres"][1])
        self.clearance = data["clearance"] / 1000
        self.axle = self.wheelbase / 2
        self.nose = self.axle + self.front_overhang
        self.stern = self.nose - self.length
