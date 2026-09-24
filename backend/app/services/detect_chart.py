import pandas as pd

Point = tuple[pd.Timestamp, float]


def extreme_between(extrema: pd.DataFrame, start, end, column: str, lowest: bool) -> Point | None:
    """Point le plus bas (ou le plus haut) de `extrema` strictement entre deux dates."""
    between = extrema[(extrema.index > start) & (extrema.index < end)]
    if between.empty:
        return None
    ts = between[column].idxmin() if lowest else between[column].idxmax()
    return ts, float(between.loc[ts, column])


def line_value(df: pd.DataFrame, a: Point, b: Point, ts) -> float:
    """Valeur au temps `ts` de la droite passant par a et b (en position de bougie, pas en temps réel)."""
    (ts_a, price_a), (ts_b, price_b) = a, b
    pos_a, pos_b = df.index.get_loc(ts_a), df.index.get_loc(ts_b)
    if pos_a == pos_b:
        return price_a
    slope = (price_b - price_a) / (pos_b - pos_a)
    return price_a + slope * (df.index.get_loc(ts) - pos_a)


def find_breakout(df: pd.DataFrame, after, a: Point, b: Point, direction: str) -> pd.Timestamp | None:
    """Première bougie après `after` dont la clôture franchit la ligne de cou a-b."""
    for ts, close in df.loc[df.index > after, "Close"].items():
        level = line_value(df, a, b, ts)
        if (direction == "down" and close < level) or (direction == "up" and close > level):
            return ts
    return None


def _detect(
    df: pd.DataFrame,
    pivots: pd.DataFrame,
    opposite: pd.DataFrame,
    inverse: bool,
    tolerance: float,
    min_head: float,
) -> list[dict]:
    column, opp_column = ("Low", "High") if inverse else ("High", "Low")
    direction = "up" if inverse else "down"
    patterns = []
    i = 0

    while i < len(pivots) - 2:
        ls, head, rs = pivots.iloc[i], pivots.iloc[i + 1], pivots.iloc[i + 2]
        ls_p, head_p, rs_p = ls[column], head[column], rs[column]

        if inverse:
            head_ok = head_p < ls_p * (1 - min_head) and head_p < rs_p * (1 - min_head)
        else:
            head_ok = head_p > ls_p * (1 + min_head) and head_p > rs_p * (1 + min_head)
        shoulders_ok = abs(ls_p - rs_p) / ls_p <= tolerance

        neck_a = extreme_between(opposite, ls.name, head.name, opp_column, lowest=not inverse)
        neck_b = extreme_between(opposite, head.name, rs.name, opp_column, lowest=not inverse)

        if not (head_ok and shoulders_ok and neck_a and neck_b):
            i += 1
            continue

        breakout = find_breakout(df, rs.name, neck_a, neck_b, direction)
        height = abs(head_p - line_value(df, neck_a, neck_b, head.name))
        neck_at_break = line_value(df, neck_a, neck_b, breakout if breakout is not None else rs.name)
        target = neck_at_break + height if inverse else neck_at_break - height

        patterns.append(
            {
                "type": "inverse_head_and_shoulders" if inverse else "head_and_shoulders",
                "confirmed": breakout is not None,
                "key_points": [
                    {"timestamp": ls.name.isoformat(), "price": ls_p, "role": "left_shoulder"},
                    {"timestamp": neck_a[0].isoformat(), "price": neck_a[1], "role": "neckline_left"},
                    {"timestamp": head.name.isoformat(), "price": head_p, "role": "head"},
                    {"timestamp": neck_b[0].isoformat(), "price": neck_b[1], "role": "neckline_right"},
                    {"timestamp": rs.name.isoformat(), "price": rs_p, "role": "right_shoulder"},
                ],
                "bias": "bullish" if inverse else "bearish",
                "target_price": target,
            }
        )
        i += 3

    return patterns


def detect_head_and_shoulders(
    df: pd.DataFrame,
    peaks: pd.DataFrame,
    troughs: pd.DataFrame,
    tolerance: float = 0.03,
    min_head: float = 0.005,
) -> list[dict]:
    """ETE baissier (sur les sommets) + ETE inversé haussier (sur les creux)."""
    return _detect(df, peaks, troughs, False, tolerance, min_head) + _detect(
        df, troughs, peaks, True, tolerance, min_head
    )
