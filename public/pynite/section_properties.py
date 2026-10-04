"""Our own cross-section properties calculator.

Pure Python (only `math`), so it runs in the server and in the browser (Pyodide) build.
Every shape function takes its dimensions and returns a dict with:
    A    area
    ixx  second moment of area about the centroidal x axis (horizontal, along b)
    iyy  second moment of area about the centroidal y axis (vertical, along h)
    J    Saint-Venant torsion constant
Axes follow sectionproperties' conventions; tests/test_section_properties.py checks it.
"""

import math


def rectangleProperties(b, h):
    """Solid rectangle of width b (along x) and depth h (along y).

    Same axes as sectionproperties' rectangular_section(d=h, b=b), so ixx = b*h^3/12 and
    iyy = h*b^3/12. J uses the Saint-Venant series solution for a rectangle.
    """
    long_side, short_side = max(b, h), min(b, h)
    series = sum(
        math.tanh(n * math.pi * long_side / (2 * short_side)) / n**5 for n in range(1, 40, 2)
    )
    J = long_side * short_side**3 / 3 * (1 - 192 / math.pi**5 * (short_side / long_side) * series)
    return {"A": b * h, "ixx": b * h**3 / 12, "iyy": h * b**3 / 12, "J": J}
