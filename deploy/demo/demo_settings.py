"""What seed.py and demo.py both need to know about the demo (0103, 0136)."""

DATABASE = "hsp_demo"
DATABASE_URL = f"postgresql+asyncpg://hsp:hsp@localhost:5432/{DATABASE}"
API_PORT = 8000
APP_PORT = 5173  # The frontend dev server: sign-in comes back to it.
