from app.routing.optimizer import OptOrder, optimize


def _line_matrix(xs):
    d = [[abs(a - b) for b in xs] for a in xs]
    t = [[abs(a - b) / 70 for b in xs] for a in xs]
    return d, t


def test_delivers_nearest_first_on_a_line():
    # depot at 0; pickups at depot; deliveries at 100 (A) and 50 (B)
    xs = [0, 0, 100, 0, 50]
    d, t = _line_matrix(xs)
    orders = [OptOrder(1, 1, 2, 4, 5000, 20), OptOrder(2, 3, 4, 4, 5000, 20)]
    # open route (no return): 0->50->100 is strictly cheaper than 0->100->50
    res = optimize(d, t, orders, 13.6, 24000, 90, eur_per_km=1.0, eur_per_hour=15, return_to_depot=False)
    kinds = [(k, oid) for _, k, oid in res.sequence if k != "depot"]
    deliveries = [oid for k, oid in kinds if k == "delivery"]
    assert deliveries == [2, 1]
    assert not res.unserved


def test_capacity_forces_second_trip():
    # two 10 LDM orders cannot share a 13.6 LDM trailer: pickups must not both precede deliveries
    xs = [0, 0, 100, 0, 100]
    d, t = _line_matrix(xs)
    orders = [OptOrder(1, 1, 2, 10, 1000, 10), OptOrder(2, 3, 4, 10, 1000, 10)]
    res = optimize(d, t, orders, 13.6, 24000, 90, eur_per_km=1.0, eur_per_hour=15)
    load, peak = 0, 0
    for _, k, _ in res.sequence:
        load += 10 if k == "pickup" else -10 if k == "delivery" else 0
        peak = max(peak, load)
    assert peak == 10
    assert not res.unserved


def test_unreachable_order_is_dropped():
    xs = [0, 0, 100]
    d, t = _line_matrix(xs)
    d[0][2] = d[1][2] = d[2][0] = d[2][1] = None
    t[0][2] = t[1][2] = t[2][0] = t[2][1] = None
    res = optimize(d, t, [OptOrder(7, 1, 2, 1, 100, 1)], 13.6, 24000, 90, 1.0, 15)
    assert res.unserved == [7]
