from app.routing.valhalla import decode_polyline6


def test_decode_polyline6():
    # encoded with precision 6: (56.626565, 23.3007), (56.95, 24.1)
    import itertools

    def enc(coords):
        out, plat, plon = [], 0, 0
        for lat, lon in coords:
            for v, p in ((round(lat * 1e6), plat), (round(lon * 1e6), plon)):
                d = v - p
                d = ~(d << 1) if d < 0 else d << 1
                while d >= 0x20:
                    out.append(chr((0x20 | (d & 0x1F)) + 63))
                    d >>= 5
                out.append(chr(d + 63))
            plat, plon = round(lat * 1e6), round(lon * 1e6)
        return "".join(out)

    pts = [(56.626565, 23.3007), (56.95, 24.1)]
    assert decode_polyline6(enc(pts)) == pts
