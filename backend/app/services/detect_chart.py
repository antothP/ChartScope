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


def is_invalidated(df: pd.DataFrame, after, extreme: float, direction: str, breakout) -> bool:
    """Vrai si le prix dépasse l'extrême de la figure (tête, sommets) avant d'avoir cassé la ligne de cou."""
    window = df.loc[df.index > after]
    if breakout is not None:
        window = window.loc[window.index < breakout]
    if direction == "down":
        return bool((window["High"] > extreme).any())
    return bool((window["Low"] < extreme).any())


def has_prior_trend(
    df: pd.DataFrame, opposite: pd.DataFrame, first, level: float, from_below: bool, volatility: float
) -> bool:
    """Une figure de retournement doit retourner une tendance : le mouvement qui y mène doit partir
    de l'autre côté de la ligne de cou. On regarde le dernier pivot opposé avant la figure
    (à défaut, l'extrême des bougies précédentes), à une taille de bougie près."""
    prior = opposite[opposite.index < first]
    before = df[df.index < first]
    if not prior.empty:
        price = prior["Low"].iloc[-1] if from_below else prior["High"].iloc[-1]
    elif not before.empty:
        price = before["Low"].min() if from_below else before["High"].max()
    else:
        return False
    margin = volatility * level
    return price <= level + margin if from_below else price >= level - margin


def _detect(
    df: pd.DataFrame,
    pivots: pd.DataFrame,
    opposite: pd.DataFrame,
    inverse: bool,
    volatility: float,
    min_depth_k: float,
    max_asymmetry: float,
    min_head_ratio: float,
) -> list[dict]:
    column, opp_column = ("Low", "High") if inverse else ("High", "Low")
    direction = "up" if inverse else "down"
    sign = -1 if inverse else 1
    patterns = []
    # des plus récents aux plus anciens : en cas de chevauchement, la configuration actuelle prime
    i = len(pivots) - 3

    while i >= 0:
        ls, head, rs = pivots.iloc[i], pivots.iloc[i + 1], pivots.iloc[i + 2]
        ls_p, head_p, rs_p = ls[column], head[column], rs[column]

        neck_a = extreme_between(opposite, ls.name, head.name, opp_column, lowest=not inverse)
        neck_b = extreme_between(opposite, head.name, rs.name, opp_column, lowest=not inverse)
        if not (neck_a and neck_b):
            i -= 1
            continue

        height = abs(head_p - line_value(df, neck_a, neck_b, head.name))
        # la tête doit dominer les épaules à l'échelle de la figure, sinon c'est un triple sommet
        head_margin = min_head_ratio * height
        head_ok = sign * (head_p - ls_p) >= head_margin and sign * (head_p - rs_p) >= head_margin
        # profondeur en tailles de bougie pour s'adapter à la volatilité de l'actif et de l'UT
        deep_enough = height / head_p >= min_depth_k * volatility
        shoulders_ok = abs(ls_p - rs_p) <= max_asymmetry * height
        # une ligne de cou trop penchée ne forme plus un ETE (même tolérance que pour les épaules)
        neckline_ok = abs(neck_a[1] - neck_b[1]) <= max_asymmetry * height
        neck_at_ls = line_value(df, neck_a, neck_b, ls.name)
        trend_ok = has_prior_trend(df, opposite, ls.name, neck_at_ls, not inverse, volatility)

        if not (head_ok and deep_enough and shoulders_ok and neckline_ok and trend_ok):
            i -= 1
            continue

        breakout = find_breakout(df, rs.name, neck_a, neck_b, direction)
        if is_invalidated(df, rs.name, head_p, direction, breakout):
            i -= 1
            continue
        neck_at_break = line_value(df, neck_a, neck_b, breakout if breakout is not None else rs.name)
        target = neck_at_break + height if inverse else neck_at_break - height

        patterns.append(
            {
                "type": "inverse_head_and_shoulders" if inverse else "head_and_shoulders",
                "confirmed": breakout is not None,
                "breakout_timestamp": breakout.isoformat() if breakout is not None else None,
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
        i -= 3

    return patterns


def detect_head_and_shoulders(
    df: pd.DataFrame,
    peaks: pd.DataFrame,
    troughs: pd.DataFrame,
    volatility: float,
    min_depth_k: float = 3.0,
    max_asymmetry: float = 0.3,
    min_head_ratio: float = 0.15,
) -> list[dict]:
    """ETE baissier (sur les sommets) + ETE inversé haussier (sur les creux)."""
    params = (volatility, min_depth_k, max_asymmetry, min_head_ratio)
    return _detect(df, peaks, troughs, False, *params) + _detect(df, troughs, peaks, True, *params)
