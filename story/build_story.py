#!/usr/bin/env python3
"""site/data/places.json -> site/story/story.json: when is the sun highest, by the clock?

    python3 build_story.py          # BUILD_OUT=... writes elsewhere (publish.sh compares)

For every town the page knows (GeoNames cities15000, 31,807 of them), the clock time of
solar noon on every day of YEAR, in the town's own zone, averaged over the year: `late` is
how many minutes after 12:00 that is. Averaging over the year takes out the equation of
time (the sun's own ±16-minute wobble, which is the same everywhere on a given day), so
what is left is the gap between the town's clock and its longitude, plus summer time.

`std` asks the question that could kill the headline: is it just summer time? It is the
same mean with the clocks held all year at the zone's smallest offset of the year. Not
Python's dst(): Europe/Dublin's winter is a negative "dst" in tzdb, so dst() would put
Ireland on summer time all year.

The sun is site/sun-logic.js's: solar() is ported below, and sunDay()'s noon (two
re-solves at the sun's position at the previous answer) is followed step for step.
test/story.test.mjs re-does a sample of towns with the real JS sunOn() and requires the
same minutes.

Weights are each town's GeoNames population. The towns hold 3.9 billion people by that
count; the rest of the world (villages, and towns under 15,000) is not in the sample.
"""
import datetime as dt
import json
import math
import os
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
PLACES = os.path.join(HERE, "site", "data", "places.json")
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "story", "story.json"))
YEAR = 2026
RAD, DEG = math.pi / 180, 180 / math.pi
# rows of the story: key -> (label, which minutes, which towns)
ROWS = [
    ("all", "every town, the clocks as kept", "late", None),
    ("std", "no summer time anywhere", "std", None),
    ("exchina", "every town outside China", "late", ("not", "China")),
    ("china", "China", "late", "China"),
    ("india", "India", "late", "India"),
    ("us", "United States", "late", "United States"),
    ("spain", "Spain", "late", "Spain"),
    ("brazil", "Brazil", "late", "Brazil"),
    ("japan", "Japan", "late", "Japan"),
]


def solar_eot(jd):
    """site/sun-logic.js solar(jd).eot, in minutes"""
    T = (jd - 2451545) / 36525
    L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360
    M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    omega = 125.04 - 1934.136 * T
    eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
    eps = eps0 + 0.00256 * math.cos(omega * RAD)
    y = math.tan((eps / 2) * RAD) ** 2
    return 4 * DEG * (y * math.sin(2 * L0 * RAD) - 2 * e * math.sin(M * RAD)
                      + 4 * e * y * math.sin(M * RAD) * math.cos(2 * L0 * RAD)
                      - 0.5 * y * y * math.sin(4 * L0 * RAD) - 1.25 * e * e * math.sin(2 * M * RAD))


def noon_min(base, lon):
    """sunDay()'s noon: minutes after 0h UTC on the date whose Julian day is `base`"""
    m = 720 - 4 * lon
    for _ in range(2):
        m = 720 - 4 * lon - solar_eot(base + m / 1440)
    return m


def wrap(m):
    """minutes after local noon, on the local date the noon falls on: east of the date line
    (Kiritimati is UTC+14 at 157°W) noon on a UTC date is a local day ahead, not 24 h late"""
    return (m + 720) % 1440 - 720


def wmedian(rows):
    """rows of (value, weight) -> the value at which half the weight is at or below"""
    rows = sorted(rows)
    half, acc = sum(w for _, w in rows) / 2, 0
    for v, w in rows:
        acc += w
        if acc >= half:
            return v


def main():
    D = json.load(open(PLACES))
    P, Z = D["places"], D["zones"]
    days = [dt.date(YEAR, 1, 1) + dt.timedelta(days=i) for i in range((dt.date(YEAR + 1, 1, 1) - dt.date(YEAR, 1, 1)).days)]
    base = [(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() / 86400) + 2440587.5 for d in days]
    # each zone's offset (minutes) at every whole UTC hour of every day: a town's offset on
    # a day is the one in force in the hour its noon falls in (zones change on the hour)
    offs = {}
    for z in sorted(set(p[6] for p in P)):
        zi = ZoneInfo(Z[z])
        offs[z] = [[dt.datetime(d.year, d.month, d.day, h, tzinfo=dt.timezone.utc).astimezone(zi).utcoffset().total_seconds() / 60
                    for h in range(24)] for d in days]
    countries = sorted(set(p[2] for p in P))
    ci = {c: i for i, c in enumerate(countries)}
    towns = []
    for p in P:
        lon = p[4]
        noon = [noon_min(b, lon) for b in base]
        o = [hours[min(23, max(0, int(n // 60)))] for n, hours in zip(noon, offs[p[6]])]
        late = sum(wrap(n + oo - 720) for n, oo in zip(noon, o)) / len(days)
        lo = min(o)
        std = sum(wrap(n + lo - 720) for n in noon) / len(days)
        towns.append([ci[p[2]], p[5], round(late * 10), round(std * 10)])

    def pick(sel):
        if sel is None:
            return towns
        if isinstance(sel, tuple):
            return [t for t in towns if countries[t[0]] != sel[1]]
        return [t for t in towns if countries[t[0]] == sel]

    check = {}
    for key, _, col, sel in ROWS:
        rows = pick(sel)
        k = 2 if col == "late" else 3
        tot = sum(t[1] for t in rows)
        check[key] = {
            "pop": tot,
            "after": sum(t[1] for t in rows if t[k] > 0) / tot,
            "half_hour": sum(t[1] for t in rows if t[k] > 300) / tot,
            "hour": sum(t[1] for t in rows if t[k] > 600) / tot,
            "near": sum(t[1] for t in rows if abs(t[k]) < 150) / tot,
            "early_half": sum(t[1] for t in rows if t[k] < -300) / tot,
            "median": wmedian([(t[k], t[1]) for t in rows]) / 10,
            "min": min(t[k] for t in rows) / 10, "max": max(t[k] for t in rows) / 10,
        }
    out = {
        "source": D["source"] + ", as the page ships it in site/data/places.json; zones from the IANA tz database",
        "year": YEAR,
        "countries": countries,
        "rows": [{"key": k, "label": lab, "col": col, "sel": (list(sel) if isinstance(sel, tuple) else sel)} for k, lab, col, sel in ROWS],
        "towns": towns,
        "check": check,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    for key, *_ in ROWS:
        c = check[key]
        print(f"{key:8s} {c['pop'] / 1e6:6.0f}M after {c['after']:.3f} >30 {c['half_hour']:.3f} >60 {c['hour']:.3f} near {c['near']:.3f} median {c['median']:+.1f} [{c['min']:+.1f}, {c['max']:+.1f}]")


if __name__ == "__main__":
    main()
