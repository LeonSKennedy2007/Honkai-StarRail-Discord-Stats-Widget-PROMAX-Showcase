import asyncio
import getpass
import os
import socket

import genshin

def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

async def main() -> None:
    email = os.environ.get("HOYO_EMAIL") or input("HoyoLab email: ")
    password = os.environ.get("HOYO_PASSWORD") or getpass.getpass("HoyoLab password: ")

    client = genshin.Client()
    port = free_port()
    print(f"Logging in (a browser page may open at http://localhost:{port} if a captcha triggers)...")
    result = await client.login_with_app_password(email, password, port=port)

    print("\nSuccess! Set these three GitHub secrets (Settings -> Secrets -> Actions):\n")
    print(f"  HOYO_LTUID_V2 = {result.ltuid_v2}")
    print(f"  HOYO_MID      = {result.ltmid_v2}")
    print(f"  HOYO_STOKEN   = {result.stoken}")
    print("\nYou can now DELETE the HOYO_LTOKEN_V2 secret if you had one —")
    print("the workflow mints a fresh ltoken_v2 from the stoken on every run.")
    print("This stoken stays valid until the account's password changes.")

if __name__ == "__main__":
    asyncio.run(main())
