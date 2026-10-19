"""Fill the demo database with Northwind Robotics, a made-up company, for showing HSP (docs/0103).

Builds everything through HSP's own API, signed in as a real user, so every rule applies:
- the org chart, from a CSV and an Excel import;
- two sites, three buildings' worth of floors, three floor plans (one with history, one
  with an open draft);
- devices, some on the plans and some issued to people;
- seats assigned to people and reserved for teams.

It first rebuilds the `hsp_demo` database from scratch, so every run gives the same demo. Run it
from backend/, with the dev stack, the API on hsp_demo and the frontend dev server running
(docs/demos/README.md):

    uv run python ../deploy/demo/seed.py
"""

import csv
import html
import io
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any, NoReturn

import httpx2
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["docker", "compose", "-f", str(ROOT / "deploy" / "compose.dev.yml")]
DATABASE = "hsp_demo"
DATABASE_URL = f"postgresql+asyncpg://hsp:hsp@localhost:5432/{DATABASE}"
APP = "http://localhost:5173"  # The frontend dev server: sign-in comes back to it.
API = f"{APP}/api/v1"
KEYCLOAK = "http://localhost:8080/auth"
PASSWORD = "demo"

# --- The company ---------------------------------------------------------------------------

# external_id, name, parent, level, color
UNITS = [
    ("NW", "Northwind Robotics", "", "Company", "#64748b"),
    ("RND", "R&D", "NW", "Division", "#2563eb"),
    ("PLAT", "Platform", "RND", "Team", "#3b82f6"),
    ("VIS", "Vision", "RND", "Team", "#8b5cf6"),
    ("HW", "Hardware", "RND", "Team", "#0891b2"),
    ("PROD", "Product", "NW", "Division", "#db2777"),
    ("DES", "Design", "PROD", "Team", "#ec4899"),
    ("PM", "Product Management", "PROD", "Team", "#f43f5e"),
    ("OPS", "Operations", "NW", "Division", "#d97706"),
    ("FIN", "Finance", "OPS", "Team", "#f59e0b"),
    ("PPL", "People & Office", "OPS", "Team", "#eab308"),
    ("SAL", "Sales", "NW", "Division", "#16a34a"),
]

# login (also the email's local part), name, title, unit, position
PEOPLE = [
    ("rachel.cohen", "Rachel Cohen", "Chief Executive Officer", "NW", "CEO"),
    ("david.mizrahi", "David Mizrahi", "VP R&D", "RND", "Head of R&D"),
    ("sam.carter", "Sam Carter", "Frontend Engineer", "PLAT", ""),
    ("omer.katz", "Omer Katz", "Engineering Lead", "PLAT", "Team Lead"),
    ("maya.shani", "Maya Shani", "Backend Engineer", "PLAT", ""),
    ("ethan.brooks", "Ethan Brooks", "Backend Engineer", "PLAT", ""),
    ("priya.nair", "Priya Nair", "Site Reliability Engineer", "PLAT", ""),
    ("lucas.martin", "Lucas Martin", "Frontend Engineer", "PLAT", ""),
    ("hannah.weiss", "Hannah Weiss", "QA Engineer", "PLAT", ""),
    ("jonah.friedman", "Jonah Friedman", "Backend Engineer", "PLAT", ""),
    ("lior.bendavid", "Lior Ben-David", "Computer Vision Lead", "VIS", "Team Lead"),
    ("tamar.azulay", "Tamar Azulay", "Computer Vision Engineer", "VIS", ""),
    ("kenji.sato", "Kenji Sato", "Machine Learning Engineer", "VIS", ""),
    ("sofia.rossi", "Sofia Rossi", "Data Engineer", "VIS", ""),
    ("noah.green", "Noah Green", "Research Scientist", "VIS", ""),
    ("amira.haddad", "Amira Haddad", "Computer Vision Engineer", "VIS", ""),
    ("yossi.peretz", "Yossi Peretz", "Hardware Lead", "HW", "Team Lead"),
    ("elena.popescu", "Elena Popescu", "Electrical Engineer", "HW", ""),
    ("ben.walker", "Ben Walker", "Mechanical Engineer", "HW", ""),
    ("shira.golan", "Shira Golan", "Firmware Engineer", "HW", ""),
    ("marco.bianchi", "Marco Bianchi", "Lab Technician", "HW", ""),
    ("natalie.levy", "Natalie Levy", "VP Product", "PROD", "Head of Product"),
    ("chloe.dubois", "Chloe Dubois", "Design Lead", "DES", "Team Lead"),
    ("avi.shapiro", "Avi Shapiro", "Product Designer", "DES", ""),
    ("grace.kim", "Grace Kim", "Product Designer", "DES", ""),
    ("daniel.ortiz", "Daniel Ortiz", "UX Researcher", "DES", ""),
    ("ella.stern", "Ella Stern", "Product Designer", "DES", ""),
    ("michael.chen", "Michael Chen", "Senior Product Manager", "PM", "Team Lead"),
    ("noa.barak", "Noa Barak", "Product Manager", "PM", ""),
    ("tom.harris", "Tom Harris", "Product Manager", "PM", ""),
    ("leah.adler", "Leah Adler", "Product Analyst", "PM", ""),
    ("gil.rosen", "Gil Rosen", "Chief Operating Officer", "OPS", "COO"),
    ("ruth.klein", "Ruth Klein", "Finance Lead", "FIN", "Team Lead"),
    ("avi.mizrahi", "Avi Mizrahi", "Controller", "FIN", ""),
    ("julia.novak", "Julia Novak", "Accountant", "FIN", ""),
    ("dana.levin", "Dana Levin", "Office Manager", "PPL", "Team Lead"),
    ("oren.tal", "Oren Tal", "People Partner", "PPL", ""),
    ("mia.johnson", "Mia Johnson", "Office Coordinator", "PPL", ""),
    ("james.wilson", "James Wilson", "Head of Sales", "SAL", "Team Lead"),
    ("liat.segal", "Liat Segal", "Account Executive", "SAL", ""),
    ("ryan.oconnor", "Ryan O'Connor", "Account Executive", "SAL", ""),
    ("yael.dror", "Yael Dror", "Sales Engineer", "SAL", ""),
    ("ahmed.khalil", "Ahmed Khalil", "Account Executive", "SAL", ""),
    ("sarah.mills", "Sarah Mills", "Customer Success Manager", "SAL", ""),
]

# The two people the demo signs in as, with Keycloak accounts (password: PASSWORD).
DEMO_USERS = [("dana.levin", True), ("sam.carter", False)]  # (login, is admin)

EMAIL = "{}@northwind.example"

# --- Who sits where ------------------------------------------------------------------------
# seat label -> a person's login, or "team:<unit id>" to reserve it for a team. Seats not
# listed stay free; bookable and unavailable seats are set on the plan.
SEATS = {
    # Tel Aviv HQ, Floor 3: R&D
    **{
        f"HT-3-{n:02d}": who
        for n, who in enumerate(
            [
                "omer.katz",
                "maya.shani",
                "ethan.brooks",
                "priya.nair",
                "sam.carter",
                "lucas.martin",
                "hannah.weiss",
                "jonah.friedman",
                "david.mizrahi",
            ],
            start=1,
        )
    },
    **{
        f"HT-3-{n:02d}": who
        for n, who in enumerate(
            [
                "lior.bendavid",
                "tamar.azulay",
                "kenji.sato",
                "sofia.rossi",
                "noah.green",
                "amira.haddad",
                "team:VIS",
                "team:VIS",
            ],
            start=11,
        )
    },
    # Floor 4: Product, Operations and Sales
    **{
        f"HT-4-{n:02d}": who
        for n, who in enumerate(
            ["chloe.dubois", "avi.shapiro", "grace.kim", "daniel.ortiz", "ella.stern", "team:DES"],
            start=1,
        )
    },
    **{
        f"HT-4-{n:02d}": who
        for n, who in enumerate(
            [
                "rachel.cohen",
                "natalie.levy",
                "gil.rosen",
                "michael.chen",
                "noa.barak",
                "tom.harris",
                "leah.adler",
            ],
            start=9,
        )
    },
    **{
        f"HT-4-{n:02d}": who
        for n, who in enumerate(["ruth.klein", "avi.mizrahi", "julia.novak", "oren.tal"], start=17)
    },
    "HT-4-21": "dana.levin",
    "HT-4-22": "mia.johnson",
    **{
        f"HT-4-{n:02d}": who
        for n, who in enumerate(
            [
                "james.wilson",
                "liat.segal",
                "ryan.oconnor",
                "yael.dror",
                "ahmed.khalil",
                "sarah.mills",
            ],
            start=23,
        )
    },
    # Haifa Lab, ground floor: Hardware
    **{
        f"LB-0-{n:02d}": who
        for n, who in enumerate(
            ["yossi.peretz", "elena.popescu", "ben.walker", "shira.golan", "marco.bianchi"], start=1
        )
    },
    "LB-0-07": "team:HW",
    "LB-0-08": "team:HW",
}


# --- Talking to HSP ------------------------------------------------------------------------


def fail(message: str) -> NoReturn:
    sys.exit(f"FAIL: {message}")


def ok(response: httpx2.Response) -> Any:
    if response.status_code >= 400:
        fail(
            f"{response.request.method} {response.request.url} -> {response.status_code}\n"
            f"{response.text}"
        )
    return response.json() if response.content else None


class Hsp:
    """HSP's API, signed in through Keycloak's own sign-in form, as a browser would."""

    def __init__(self, login: str) -> None:
        self.client = httpx2.Client(follow_redirects=False, timeout=60)
        r = self.client.get(f"{API}/auth/login")
        page = self.client.get(r.headers["location"])
        form = re.search(r'action="([^"]+)"', page.text)
        if not form:
            fail(f"no Keycloak sign-in form at {r.headers['location']}")
        cookies = "; ".join(
            f"{c.name}={c.value}" for c in self.client.cookies.jar if c.path.startswith("/auth")
        )
        r = self.client.post(
            html.unescape(form.group(1)),
            data={"username": login, "password": PASSWORD, "credentialId": ""},
            headers={"Cookie": cookies},
        )
        if "location" not in r.headers:
            fail(f"Keycloak refused {login}'s sign-in")
        self.client.get(r.headers["location"])
        self.headers = {"X-CSRF-Token": self.get("/auth/me")["csrf_token"]}

    def get(self, path: str, **params: Any) -> Any:
        return ok(self.client.get(API + path, params=params))

    def post(self, path: str, body: Any = None, **kwargs: Any) -> Any:
        return ok(self.client.post(API + path, json=body, headers=self.headers, **kwargs))

    def put(self, path: str, body: Any) -> Any:
        return ok(self.client.put(API + path, json=body, headers=self.headers))

    def patch(self, path: str, body: Any) -> Any:
        return ok(self.client.patch(API + path, json=body, headers=self.headers))

    def delete(self, path: str) -> Any:
        return ok(self.client.delete(API + path, headers=self.headers))


# --- A floor plan, as changeset operations -------------------------------------------------


class Plan:
    """Collects the operations that draw one floor. Lengths are millimetres; y points north."""

    def __init__(self, catalog: dict[str, str], zone_types: dict[str, str], prefix: str) -> None:
        self.ops: list[dict[str, Any]] = []
        self.catalog = catalog
        self.zone_types = zone_types
        self.prefix = prefix
        self.seats = 0

    def add(self, kind: str, data: dict[str, Any]) -> str:
        id_ = str(uuid.uuid4())
        self.ops.append({"op": "add", "kind": kind, "id": id_, "data": data})
        return id_

    def wall(self, a: tuple[int, int], b: tuple[int, int], thickness: int = 200) -> str:
        return self.add("wall", {"a": a, "b": b, "thickness_mm": thickness, "height_mm": 3000})

    def outline(self, width: int, depth: int, windows: int, walls_at: tuple[int, ...] = ()) -> None:
        """The outer walls, with a door in the south wall and windows north and south. No
        window is drawn across the entrance or where an inner wall meets the south wall
        (`walls_at`, x positions)."""
        south = self.wall((0, 0), (width, 0))
        self.wall((width, 0), (width, depth))
        north = self.wall((width, depth), (0, depth))
        self.wall((0, depth), (0, 0))
        self.door(south, width // 2 - 500, 1200)
        step = width // windows
        for n in range(windows):
            for wall in (south, north):
                offset = step * n + step // 2 - 1200
                if wall == south and (
                    abs(offset + 1200 - width // 2) < 2500
                    or any(offset - 200 <= x <= offset + 2600 for x in walls_at)
                ):
                    continue
                self.add(
                    "opening",
                    {
                        "wall_id": wall,
                        "type": "window",
                        "offset_mm": offset,
                        "width_mm": 2400,
                        "height_mm": 1500,
                        "sill_mm": 900,
                        "swing": "none",
                    },
                )

    def door(self, wall: str, offset: int, width: int = 900) -> None:
        self.add(
            "opening",
            {
                "wall_id": wall,
                "type": "door",
                "offset_mm": offset,
                "width_mm": width,
                "height_mm": 2100,
                "swing": "left_in",
            },
        )

    def room(
        self,
        name: str,
        zone_type: str,
        x0: int,
        y0: int,
        x1: int,
        y1: int,
        walls: list[tuple[tuple[int, int], tuple[int, int]]],
        door_on: int = 0,
    ) -> None:
        """A zone, with the inner walls that close it; a door in walls[door_on]."""
        ids = [self.wall(a, b, 120) for a, b in walls]
        if ids:
            (ax, ay), (bx, by) = walls[door_on]
            self.door(ids[door_on], max(abs(bx - ax), abs(by - ay)) // 2 - 450)
        self.zone(name, zone_type, x0, y0, x1, y1)

    def zone(self, name: str, zone_type: str, x0: int, y0: int, x1: int, y1: int) -> str:
        return self.add(
            "zone",
            {
                "name": name,
                "zone_type_id": self.zone_types[zone_type],
                "boundary": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
            },
        )

    def thing(self, key: str, x: int, y: int, z: int = 0, rotation: int = 0, **extra: Any) -> str:
        return self.add(
            "object",
            {
                "catalog_item_rev_id": self.catalog[key],
                "position": [x, y, z],
                "rotation_ddeg": rotation,
                **extra,
            },
        )

    def desks(
        self,
        x0: int,
        y: int,
        columns: int,
        *,
        key: str = "desk_1600x800",
        monitors: list[str] | None = None,
        modes: dict[int, str] | None = None,
    ) -> None:
        """Two back-to-back rows of desks, each with a chair; labels count on from the last.
        `monitors` are device ids for the desks' monitors, in order; `modes` sets a desk's
        allocation mode by its position in this cluster (0-based)."""
        monitors = list(monitors or [])
        index = 0
        for dy, rotation, chair_dy in ((0, 0, -700), (820, 1800, 700)):
            for column in range(columns):
                self.seats += 1
                x = x0 + column * 1650
                mode = (modes or {}).get(index, "assigned")
                desk = self.thing(
                    key,
                    x,
                    y + dy,
                    rotation=rotation,
                    label=f"{self.prefix}-{self.seats:02d}",
                    allocation_mode=mode,
                )
                self.thing("task_chair", x, y + dy + chair_dy, rotation=rotation)
                if monitors:
                    self.thing(
                        "monitor_27",
                        x,
                        y + dy,
                        740,
                        rotation,
                        attached_to=desk,
                        device_id=monitors.pop(0),
                    )
                index += 1


# --- Steps ---------------------------------------------------------------------------------


def reset_database() -> None:
    print(f"== A fresh {DATABASE} database")
    psql = [*COMPOSE, "exec", "-T", "postgres", "psql", "-U", "hsp", "-d", "hsp", "-q"]
    subprocess.run([*psql, "-c", f"DROP DATABASE IF EXISTS {DATABASE} WITH (FORCE)"], check=True)
    subprocess.run([*psql, "-c", f"CREATE DATABASE {DATABASE}"], check=True)
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
        cwd=ROOT / "backend",
        env={**os.environ, "HSP_DATABASE_URL": DATABASE_URL},
    )


def demo_users() -> None:
    """Dana (admin) and Sam, in the dev realm, matching their people records by email."""
    print("== Sign-in accounts for Dana and Sam")
    token = ok(
        httpx2.post(
            f"{KEYCLOAK}/realms/master/protocol/openid-connect/token",
            data={
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": "admin",
                "password": "admin",
            },
        )
    )["access_token"]
    kc = httpx2.Client(
        base_url=f"{KEYCLOAK}/admin/realms/hsp",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    admin_role = ok(kc.get("/roles/hsp-admin"))
    names = {login: name for login, name, *_ in PEOPLE}
    for login, is_admin in DEMO_USERS:
        first, last = names[login].split(" ", 1)
        found = ok(kc.get("/users", params={"username": login, "exact": "true"}))
        if found:
            user_id = found[0]["id"]
        else:
            ok(
                kc.post(
                    "/users",
                    json={
                        "username": login,
                        "email": EMAIL.format(login),
                        "firstName": first,
                        "lastName": last,
                        "enabled": True,
                        "emailVerified": True,
                    },
                )
            )
            user_id = ok(kc.get("/users", params={"username": login, "exact": "true"}))[0]["id"]
        ok(
            kc.put(
                f"/users/{user_id}/reset-password",
                json={"type": "password", "value": PASSWORD, "temporary": False},
            )
        )
        if is_admin:
            ok(kc.post(f"/users/{user_id}/role-mappings/realm", json=[admin_role]))


def check_api_uses_demo_database(hsp: Hsp) -> None:
    """Refuse to go on if the API isn't on hsp_demo, so a dev database is never filled."""
    probe = hsp.post("/sites", {"name": "demo database check", "time_zone": "UTC"})
    found = subprocess.run(
        [
            *COMPOSE,
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "hsp",
            "-d",
            DATABASE,
            "-tAc",
            f"SELECT count(*) FROM site WHERE id = '{probe['id']}'",
        ],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    hsp.delete(f"/sites/{probe['id']}")
    if found != "1":
        fail(
            f"the API at {API} isn't using the {DATABASE} database. Start it with "
            f"HSP_DATABASE_URL={DATABASE_URL} (docs/demos/README.md)."
        )


def org(hsp: Hsp) -> tuple[dict[str, str], dict[str, str]]:
    print("== The org chart, imported from CSV and Excel")
    units_csv = io.StringIO()
    writer = csv.writer(units_csv)
    writer.writerow(["external_id", "name", "parent_external_id", "level_label"])
    writer.writerows(row[:4] for row in UNITS)
    hsp.post(
        "/imports/units?apply=true",
        files={"file": ("units.csv", units_csv.getvalue().encode(), "text/csv")},
    )
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(
        [
            "email",
            "display_name",
            "external_id",
            "title",
            "primary_unit_external_id",
            "secondary_unit_external_ids",
            "position",
        ]
    )
    for n, (login, name, title, unit, position) in enumerate(PEOPLE, start=1001):
        sheet.append([EMAIL.format(login), name, f"E{n}", title, unit, "", position])
    workbook = io.BytesIO()
    book.save(workbook)
    hsp.post(
        "/imports/people?apply=true",
        files={"file": ("people.xlsx", workbook.getvalue(), "application/octet-stream")},
    )

    units = {u["external_id"]: u["id"] for u in hsp.get("/org-units", limit=200)["items"]}
    for external_id, *_, color in UNITS:
        hsp.patch(f"/org-units/{units[external_id]}", {"color": color})
    by_email = {p["email"]: p["id"] for p in hsp.get("/people", limit=200)["items"]}
    people = {login: by_email[EMAIL.format(login)] for login, *_ in PEOPLE}
    return units, people


def devices(hsp: Hsp, people: dict[str, str]) -> dict[str, list[str]]:
    """Monitors for the desks, printers and displays, and laptops issued to people."""
    print("== Devices")
    made: dict[str, list[str]] = {"monitor": [], "printer": [], "display": []}
    for n in range(1, 21):
        made["monitor"].append(
            hsp.post(
                "/devices", {"asset_tag": f"MON-{n:04d}", "serial_number": f"DL27Q-{48210 + n}"}
            )["id"]
        )
    for n, floor in enumerate(["Floor 3", "Floor 4", "Haifa lab"], start=1):
        made["printer"].append(
            hsp.post(
                "/devices",
                {
                    "asset_tag": f"PRN-{n:04d}",
                    "serial_number": f"MFP-77{n}0",
                    "notes": f"{floor} printer",
                },
            )["id"]
        )
    made["display"].append(
        hsp.post(
            "/devices", {"asset_tag": "TV-0001", "serial_number": "LG65-2291", "notes": "Boardroom"}
        )["id"]
    )
    for n, login in enumerate(
        ["sam.carter", "maya.shani", "noa.barak", "liat.segal", "yossi.peretz", "dana.levin"],
        start=1,
    ):
        hsp.post(
            "/devices",
            {
                "asset_tag": f"LAP-{n:04d}",
                "serial_number": f"XPS-{7300 + n}",
                "notes": "Laptop",
                "assigned_person_id": people[login],
            },
        )
    for n in range(21, 25):
        hsp.post(
            "/devices",
            {
                "asset_tag": f"MON-{n:04d}",
                "serial_number": f"DL27Q-{48210 + n}",
                "notes": "Spare, in the storeroom",
            },
        )
    return made


def publish(
    hsp: Hsp,
    floor_id: str,
    plans: list[tuple[list[dict[str, Any]], str]],
    draft: list[dict[str, Any]] | None = None,
) -> None:
    """Publish each (ops, note) in turn, then leave `draft` open, if given."""
    path = f"/floors/{floor_id}"
    hsp.post(f"{path}/lock")
    for ops, note in plans:
        changeset = hsp.post(f"{path}/draft/changesets", {"base_revision": 0, "ops": ops})
        hsp.post(f"{path}/draft/publish", {"base_revision": changeset["revision"], "note": note})
    if draft:
        hsp.post(f"{path}/draft/changesets", {"base_revision": 0, "ops": draft})
    hsp.delete(f"{path}/lock")


def floor_3(hsp: Hsp, plan: Plan, floor_id: str, monitors: list[str], printer: str) -> None:
    """R&D: the Platform and Vision pods, two meeting rooms and hot desks. Two versions."""
    plan.outline(32000, 18000, windows=6, walls_at=(20000, 24000))
    core = [
        ((14000, 7000), (18000, 7000)),
        ((18000, 7000), (18000, 11000)),
        ((18000, 11000), (14000, 11000)),
        ((14000, 11000), (14000, 7000)),
    ]
    plan.room("Core", "Core", 14000, 7000, 18000, 11000, core, door_on=3)
    plan.zone("Platform pod", "Pod", 1500, 1500, 12500, 6500)
    plan.desks(2600, 3200, 5, monitors=monitors[:10], modes={9: "unavailable"})
    plan.zone("Vision pod", "Pod", 1500, 11500, 12500, 16500)
    plan.desks(2600, 13200, 5, monitors=monitors[10:20])
    plan.room(
        "Focus room",
        "Meeting room",
        20000,
        0,
        24000,
        5000,
        [((20000, 0), (20000, 5000)), ((20000, 5000), (24000, 5000)), ((24000, 5000), (24000, 0))],
        door_on=1,
    )
    plan.thing("desk_1400x700", 22000, 2500, label="Focus table", allocation_mode="unavailable")
    plan.room(
        "Robotics sync", "Meeting room", 24000, 0, 32000, 5000, [((24000, 5000), (32000, 5000))]
    )
    plan.thing("meeting_table_2400x1200", 28000, 2500)
    plan.thing("wall_tv_65", 28000, 4880, 1200, 1800, label="Sync room display")
    plan.zone("Hot desks", "Pod", 20000, 11500, 30500, 16500)
    plan.desks(
        21100, 13200, 3, key="sit_stand_desk_1600x800", modes={n: "bookable" for n in range(6)}
    )
    plan.add(
        "column",
        {
            "footprint": [[9800, 8800], [10200, 8800], [10200, 9200], [9800, 9200]],
            "height_mm": 3000,
        },
    )
    for x in (20500, 21100, 21700):
        plan.thing("locker_tall", x, 7300)
    first = plan.ops
    plan.ops = []
    plan.thing("printer_mfp", 13000, 6000, label="Floor 3 printer", device_id=printer)
    for x, y in ((800, 800), (31200, 17200), (13000, 17200), (19200, 8000)):
        plan.thing("plant_large", x, y)
    publish(
        hsp,
        floor_id,
        [(first, "First layout of the R&D floor"), (plan.ops, "Add the printer and plants")],
    )


def floor_4(hsp: Hsp, plan: Plan, floor_id: str, printer: str, display: str) -> None:
    """Product, Operations and Sales, with the boardroom; a draft is left open."""
    plan.outline(32000, 18000, windows=6, walls_at=(7000,))
    core = [
        ((14000, 7000), (18000, 7000)),
        ((18000, 7000), (18000, 11000)),
        ((18000, 11000), (14000, 11000)),
        ((14000, 11000), (14000, 7000)),
    ]
    plan.room("Core", "Core", 14000, 7000, 18000, 11000, core, door_on=3)
    plan.zone("Design studio", "Pod", 1000, 12500, 7800, 17000)
    plan.desks(1900, 14200, 4, modes={7: "bookable"})
    plan.zone("Product pod", "Pod", 8500, 12500, 15200, 17000)
    plan.desks(9400, 14200, 4)
    plan.room(
        "Finance office",
        "Room",
        0,
        0,
        7000,
        6000,
        [((7000, 0), (7000, 6000)), ((7000, 6000), (0, 6000))],
        door_on=0,
    )
    plan.desks(2000, 2400, 2)
    plan.zone("Reception", "Wing", 9000, 1500, 13000, 5500)
    plan.thing("desk_1800x900", 10200, 3000, label="HT-4-21", allocation_mode="assigned")
    plan.thing("task_chair", 10200, 3700, rotation=1800)
    plan.thing("desk_1800x900", 11900, 3000, label="HT-4-22", allocation_mode="assigned")
    plan.thing("task_chair", 11900, 3700, rotation=1800)
    plan.seats = 22
    sales = plan.zone("Sales pod", "Pod", 19000, 1500, 31000, 6500)
    plan.desks(20100, 3200, 5, modes={6: "bookable", 7: "bookable", 8: "unavailable"})
    plan.room(
        "Boardroom",
        "Meeting room",
        20500,
        12000,
        32000,
        18000,
        [((20500, 12000), (32000, 12000)), ((20500, 12000), (20500, 18000))],
    )
    plan.thing("meeting_table_2400x1200", 25000, 15000)
    plan.thing("meeting_table_2400x1200", 27500, 15000)
    plan.thing("wall_tv_65", 31820, 15000, 1200, 900, label="Boardroom display", device_id=display)
    plan.thing("printer_mfp", 13600, 6000, label="Floor 4 printer", device_id=printer)
    for x, y in ((800, 11500), (19200, 11500), (31200, 800)):
        plan.thing("plant_large", x, y)
    draft = [
        {"op": "update", "kind": "zone", "id": sales, "data": {"name": "Sales & Partners"}},
        {
            "op": "add",
            "kind": "object",
            "id": str(uuid.uuid4()),
            "data": {
                "catalog_item_rev_id": plan.catalog["plant_large"],
                "position": [18800, 6000, 0],
                "rotation_ddeg": 0,
            },
        },
    ]
    publish(hsp, floor_id, [(plan.ops, "First layout")], draft)


def haifa(hsp: Hsp, plan: Plan, floor_id: str, printer: str) -> None:
    """The hardware lab: workbenches reserved for the team, and desks."""
    plan.outline(24000, 14000, windows=4, walls_at=(13000,))
    plan.room("Hardware lab", "Room", 0, 0, 13000, 14000, [((13000, 0), (13000, 14000))])
    for n, (x, y) in enumerate(((3500, 4000), (9000, 4000), (3500, 10000), (9000, 10000))):
        plan.thing(
            "desk_1800x900",
            x,
            y,
            label=f"LB-0-{n + 7:02d}",
            allocation_mode="assigned" if n < 2 else "bookable",
        )
        plan.thing("task_chair", x, y - 750)
    plan.seats = 0
    plan.zone("Team desks", "Pod", 14500, 4000, 23000, 10000)
    plan.desks(15600, 6200, 3)
    plan.thing("printer_mfp", 22800, 1200, label="Lab printer", device_id=printer)
    for y in (11000, 11450, 11900):
        plan.thing("locker_tall", 13400, y, rotation=900)
    publish(hsp, floor_id, [(plan.ops, "Lab layout")])


def seats(hsp: Hsp, units: dict[str, str], people: dict[str, str]) -> None:
    print("== Seat assignments")
    found = {s["label"]: s["id"] for s in hsp.get("/seats", limit=200)["items"]}
    missing = sorted(set(SEATS) - set(found))
    if missing:
        fail(f"no seats labelled {', '.join(missing)} on the published plans")
    for label, who in SEATS.items():
        holder = (
            {"unit_id": units[who[5:]]} if who.startswith("team:") else {"person_id": people[who]}
        )
        hsp.put(f"/seats/{found[label]}/assignment", holder)


def main() -> None:
    reset_database()
    demo_users()
    hsp = Hsp("dana.levin")
    check_api_uses_demo_database(hsp)
    units, people = org(hsp)
    made = devices(hsp, people)

    print("== Places and floor plans")
    catalog = {
        i["key"]: i["current_revision"]["id"] for i in hsp.get("/catalog-items", limit=200)["items"]
    }
    zone_types = {z["name"]: z["id"] for z in hsp.get("/zone-types")["items"]}
    tel_aviv = hsp.post(
        "/sites",
        {
            "name": "Tel Aviv HQ",
            "time_zone": "Asia/Jerusalem",
            "address": "12 Harbor Street, Tel Aviv",
        },
    )
    tower = hsp.post(
        "/buildings", {"site_id": tel_aviv["id"], "name": "Harbor Tower", "code": "HT"}
    )
    f3 = hsp.post("/floors", {"building_id": tower["id"], "name": "Floor 3", "level_index": 3})
    f4 = hsp.post("/floors", {"building_id": tower["id"], "name": "Floor 4", "level_index": 4})
    hsp.post("/floors", {"building_id": tower["id"], "name": "Floor 5", "level_index": 5})
    haifa_site = hsp.post(
        "/sites",
        {"name": "Haifa Lab", "time_zone": "Asia/Jerusalem", "address": "4 Technion Road, Haifa"},
    )
    lab = hsp.post(
        "/buildings", {"site_id": haifa_site["id"], "name": "Lab Building", "code": "LB"}
    )
    ground = hsp.post(
        "/floors", {"building_id": lab["id"], "name": "Ground floor", "level_index": 0}
    )
    floor_3(hsp, Plan(catalog, zone_types, "HT-3"), f3["id"], made["monitor"], made["printer"][0])
    floor_4(
        hsp, Plan(catalog, zone_types, "HT-4"), f4["id"], made["printer"][1], made["display"][0]
    )
    haifa(hsp, Plan(catalog, zone_types, "LB-0"), ground["id"], made["printer"][2])

    seats(hsp, units, people)
    hsp.put("/me/preferences", {"language": "en", "theme": "light"})
    print(
        f"\nReady: open {APP} and sign in as dana.levin (admin) or sam.carter, "
        f"password '{PASSWORD}'."
    )


if __name__ == "__main__":
    main()
