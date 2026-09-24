"""Resumen legible de los cambios en las líneas de un pedido (para bitácora y correo)."""


def summarize_line_changes(old: dict[str, tuple[int, float]], new: dict[str, tuple[int, float]]) -> list[str]:
    """`old`/`new`: {código de referencia: (cantidad, precio unitario)}."""
    changes = []
    for code in sorted(old.keys() | new.keys()):
        if code not in new:
            changes.append(f"Eliminada REF {code} (x{old[code][0]})")
        elif code not in old:
            changes.append(f"Agregada REF {code} x{new[code][0]}")
        else:
            (oq, op), (nq, np) = old[code], new[code]
            if oq != nq:
                changes.append(f"REF {code}: {oq} → {nq} u")
            if float(op) != float(np):
                changes.append(f"REF {code}: precio {float(op):,.0f} → {float(np):,.0f}")
    return changes


if __name__ == "__main__":
    old = {"1203": (12, 10000), "1300": (5, 8000), "1400": (2, 5000)}
    new = {"1203": (18, 10000), "1300": (5, 9000), "1450": (6, 7000)}
    assert summarize_line_changes(old, new) == [
        "REF 1203: 12 → 18 u",
        "REF 1300: precio 8,000 → 9,000",
        "Eliminada REF 1400 (x2)",
        "Agregada REF 1450 x6",
    ], summarize_line_changes(old, new)
    assert summarize_line_changes(old, old) == []
    print("ok")
