import asyncio
from io import BytesIO
from pathlib import Path
from time import perf_counter

from PIL import Image, ImageOps
from ollama import AsyncClient


# ---------- ตั้งค่า ----------

MODEL = "gemma3:4b"
IMAGE_PATH = Path(__file__).resolve().parent / "after.png"

MAX_IMAGE_SIZE = 512
MAX_WAIT_SECONDS = 180

PROMPT = """
ภาพนี้เห็นอะไร?
ตอบภาษาไทยเพียง 1 ประโยคสั้น ๆ
บอกวัตถุหลักและลักษณะที่เห็นชัด เช่น สีหรือรูปทรง
ไม่ต้องวิเคราะห์ความเสียหายหรือให้คำแนะนำ
หากมองไม่ชัดให้บอกว่าไม่ชัด ห้ามเดา
"""


# ---------- เตรียมภาพ ----------

def prepare_image(path):
    if not path.is_file():
        raise FileNotFoundError(
            f"ไม่พบภาพ: {path}\n"
            "นำ after.png ไปวางในโฟลเดอร์เดียวกับ local_vision.py"
        )

    with Image.open(path) as original:
        picture = ImageOps.exif_transpose(original).convert("RGBA")

        picture.thumbnail(
            (MAX_IMAGE_SIZE, MAX_IMAGE_SIZE),
            Image.Resampling.LANCZOS,
        )

        # วางภาพ PNG ที่มีพื้นโปร่งใสบนพื้นสีขาว
        background = Image.new("RGBA", picture.size, "white")
        background.alpha_composite(picture)
        picture = background.convert("RGB")

        buffer = BytesIO()
        picture.save(buffer, format="PNG")

        print(
            f"เตรียมภาพแล้ว: {path.name} "
            f"({picture.width} × {picture.height} พิกเซล)",
            flush=True,
        )

        return buffer.getvalue()


# ---------- แสดงเวลารอ ----------

async def show_waiting(started, first_text):
    while not first_text.is_set():
        elapsed = int(perf_counter() - started)

        print(
            f"\rกำลังรอ AI วิเคราะห์ภาพ | {elapsed} วินาที"
            " | กด Ctrl+C เพื่อยกเลิก",
            end="",
            flush=True,
        )

        await asyncio.sleep(1)


# ---------- วิเคราะห์ภาพ ----------

async def inspect(image_bytes, first_text):
    client = AsyncClient(
        host="http://127.0.0.1:11434",
        timeout=MAX_WAIT_SECONDS,
    )

    stream = None
    got_text = False
    completed = False

    try:
        stream = await client.chat(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": PROMPT,
                    "images": [image_bytes],
                }
            ],
            options={
                "temperature": 0,
                "num_ctx": 2048,
                "num_predict": 60,
            },
            keep_alive="5m",
            stream=True,
        )

        async for chunk in stream:
            text = chunk.message.content or ""

            if text:
                if not got_text:
                    first_text.set()
                    print("\n\nAI เริ่มตอบแล้ว:\n", flush=True)
                    got_text = True

                print(text, end="", flush=True)

            if chunk.done:
                completed = True

                if chunk.done_reason == "length":
                    print(
                        "\n\n[ถึงขีดจำกัดความยาว "
                        "คำตอบอาจยังไม่ครบ]",
                        flush=True,
                    )

        if not got_text:
            raise RuntimeError("โมเดลไม่ได้ส่งคำอธิบายกลับมา")

        if not completed:
            raise RuntimeError(
                "การเชื่อมต่อจบก่อนโมเดลตอบครบ "
                "ข้อความด้านบนอาจไม่สมบูรณ์"
            )

    finally:
        if stream is not None:
            await stream.aclose()


# ---------- เริ่มทำงาน ----------

async def main():
    image_bytes = prepare_image(IMAGE_PATH)
    started = perf_counter()

    first_text = asyncio.Event()
    waiting_task = asyncio.create_task(
        show_waiting(started, first_text)
    )

    final_message = ""

    try:
        await asyncio.wait_for(
            inspect(image_bytes, first_text),
            timeout=MAX_WAIT_SECONDS,
        )

        final_message = "รับคำตอบเสร็จแล้ว"

    except asyncio.TimeoutError:
        final_message = (
            f"ครบเวลารอ {MAX_WAIT_SECONDS} วินาที "
            "จึงยกเลิกการรอผล\n"
            "หากมีคำตอบแสดงแล้ว คำตอบนั้นอาจยังไม่ครบ"
        )

    except asyncio.CancelledError:
        final_message = "ยกเลิกการรอแล้ว"
        raise

    except Exception as error:
        final_message = f"วิเคราะห์ไม่สำเร็จ: {error}"

    finally:
        first_text.set()
        waiting_task.cancel()

        try:
            await waiting_task
        except asyncio.CancelledError:
            pass

        elapsed = perf_counter() - started

        print(f"\n\n{final_message}", flush=True)
        print(f"เวลารวม: {elapsed:.1f} วินาที", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nปิดการทดสอบแล้ว")
    except Exception as error:
        print(f"\nเกิดข้อผิดพลาด: {error}")