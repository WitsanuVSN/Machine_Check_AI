import base64

import cv2
import numpy as np
from skimage.metrics import structural_similarity


def decode_image(image_bytes):
    """แปลงข้อมูลไฟล์รูปเป็นภาพ OpenCV"""
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError("อ่านภาพไม่ได้ กรุณาใช้ภาพ JPG หรือ PNG")

    height, width = image.shape[:2]

    if min(height, width) < 100:
        raise ValueError("ภาพเล็กเกินไป กรุณาใช้ภาพอย่างน้อย 100x100")

    # ลดขนาดโดยคงสัดส่วน เพื่อประมวลผลเร็วขึ้น
    if max(height, width) > 1000:
        scale = 1000 / max(height, width)

        image = cv2.resize(
            image,
            (round(width * scale), round(height * scale)),
            interpolation=cv2.INTER_AREA,
        )

    return image


def encode_image(image):
    """แปลงภาพผลตรวจเป็น data URL ให้ React แสดงได้"""
    success, buffer = cv2.imencode(
        ".jpg",
        image,
        [cv2.IMWRITE_JPEG_QUALITY, 80],
    )

    if not success:
        raise ValueError("สร้างภาพผลตรวจไม่สำเร็จ")

    encoded = base64.b64encode(buffer).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def cannot_compare(message):
    """ไม่คืนผลผ่าน เมื่อเปรียบเทียบไม่ได้"""
    return {
        "status": "unable_to_compare",
        "message": message,
        "similarity": None,
        "changed_percent": None,
        "boxes": [],
        "result_image": None,
    }


def compare_images(reference_bytes, current_bytes):
    """
    เทียบภาพมาตรฐานกับภาพปัจจุบัน

    status:
    - unable_to_compare: เปรียบเทียบไม่ได้ ต้องตรวจเอง/ถ่ายใหม่
    - review: พบความต่าง ควรตรวจทาน
    - no_major_change: ไม่พบความต่างมากตามเกณฑ์ทดลอง
    """
    reference = decode_image(reference_bytes)
    current = decode_image(current_bytes)

    reference_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    current_gray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)

    # เกณฑ์เบื้องต้น ยังต้องปรับจากภาพหน้างานจริง
    for name, gray in [
        ("ภาพมาตรฐาน", reference_gray),
        ("ภาพปัจจุบัน", current_gray),
    ]:
        brightness = float(gray.mean())

        if brightness < 35 or brightness > 235:
            return cannot_compare(
                f"{name}มืดหรือสว่างเกินไป กรุณาถ่ายใหม่"
            )

    # ค้นหาจุดเด่นของภาพเพื่อจับคู่ตำแหน่ง
    orb = cv2.ORB_create(nfeatures=3000)

    reference_points, reference_desc = orb.detectAndCompute(
        reference_gray, None
    )

    current_points, current_desc = orb.detectAndCompute(
        current_gray, None
    )

    if reference_desc is None or current_desc is None:
        return cannot_compare(
            "รายละเอียดภาพไม่พอ กรุณาถ่ายให้ชัดและเห็นจุดตรวจครบ"
        )

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)

    pairs = matcher.knnMatch(
        current_desc,
        reference_desc,
        k=2,
    )

    matches = [
        pair[0]
        for pair in pairs
        if len(pair) == 2
        and pair[0].distance < 0.75 * pair[1].distance
    ]

    if len(matches) < 15:
        return cannot_compare(
            "จับคู่ภาพไม่ได้ อาจถ่ายคนละจุด มุมต่างมาก "
            "หรือสภาพเปลี่ยนมาก กรุณาตรวจด้วยคน"
        )

    source = np.float32([
        current_points[match.queryIdx].pt
        for match in matches
    ]).reshape(-1, 1, 2)

    destination = np.float32([
        reference_points[match.trainIdx].pt
        for match in matches
    ]).reshape(-1, 1, 2)

    transform, inliers = cv2.findHomography(
        source,
        destination,
        cv2.RANSAC,
        4.0,
    )

    if (
        transform is None
        or inliers is None
        or not np.isfinite(transform).all()
    ):
        return cannot_compare("จัดแนวภาพไม่สำเร็จ กรุณาถ่ายใหม่")

    inlier_count = int(inliers.sum())
    inlier_ratio = inlier_count / len(matches)

    if inlier_count < 12 or inlier_ratio < 0.5:
        return cannot_compare(
            "การจับคู่ตำแหน่งไม่น่าเชื่อถือ กรุณาถ่ายมุมเดิม"
        )

    height, width = reference_gray.shape

    # จุดที่จับคู่ต้องกระจายพอ ไม่กระจุกอยู่มุมเดียว
    matched_points = destination[inliers.ravel() == 1]
    hull = cv2.convexHull(matched_points)

    if cv2.contourArea(hull) < width * height * 0.10:
        return cannot_compare(
            "จับคู่ได้เฉพาะพื้นที่เล็ก ๆ กรุณาถ่ายให้เห็นจุดตรวจครบ"
        )

    # ป้องกันการจัดแนวที่ยืดหรือกลับด้านผิดปกติ
    current_height, current_width = current_gray.shape

    corners = np.float32([
        [0, 0],
        [current_width - 1, 0],
        [current_width - 1, current_height - 1],
        [0, current_height - 1],
    ]).reshape(-1, 1, 2)

    projected = cv2.perspectiveTransform(corners, transform)

    if not np.isfinite(projected).all():
        return cannot_compare("มุมภาพต่างกันมากเกินไป")

    area_ratio = cv2.contourArea(projected) / (width * height)

    if (
        not cv2.isContourConvex(projected)
        or not 0.5 <= area_ratio <= 2.0
    ):
        return cannot_compare(
            "ระยะหรือมุมภาพต่างกันมาก กรุณาถ่ายใกล้เคียงภาพมาตรฐาน"
        )

    aligned = cv2.warpPerspective(
        current,
        transform,
        (width, height),
    )

    # เปรียบเทียบเฉพาะพื้นที่ที่มีภาพจริงทั้งสองภาพ
    source_mask = np.full(
        current_gray.shape,
        255,
        dtype=np.uint8,
    )

    valid_mask = cv2.warpPerspective(
        source_mask,
        transform,
        (width, height),
        flags=cv2.INTER_NEAREST,
    )

    valid_mask = cv2.erode(
        valid_mask,
        np.ones((11, 11), dtype=np.uint8),
        borderType=cv2.BORDER_CONSTANT,
        borderValue=0,
    )

    valid_pixels = valid_mask > 0
    coverage = float(valid_pixels.mean())

    if coverage < 0.85:
        return cannot_compare(
            "ภาพครอบคลุมจุดตรวจไม่พอ กรุณาถ่ายให้ครบมุมเดิม"
        )

    aligned_gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)

    reference_blur = cv2.GaussianBlur(
        reference_gray, (5, 5), 0
    )
    current_blur = cv2.GaussianBlur(
        aligned_gray, (5, 5), 0
    )

    _, similarity_map = structural_similarity(
        reference_blur,
        current_blur,
        data_range=255,
        full=True,
    )

    similarity = float(similarity_map[valid_pixels].mean())

    # เกณฑ์ทดลอง ไม่ใช่เกณฑ์รับรองความปลอดภัยเครื่องจักร
    difference_mask = (
        (similarity_map < 0.65) & valid_pixels
    ).astype(np.uint8) * 255

    difference_mask = cv2.morphologyEx(
        difference_mask,
        cv2.MORPH_OPEN,
        np.ones((3, 3), dtype=np.uint8),
    )

    changed_percent = (
        np.count_nonzero(difference_mask)
        / np.count_nonzero(valid_pixels)
        * 100
    )

    contours, _ = cv2.findContours(
        difference_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    result_image = aligned.copy()
    boxes = []
    minimum_area = width * height * 0.001

    for contour in contours:
        if cv2.contourArea(contour) < minimum_area:
            continue

        x, y, box_width, box_height = cv2.boundingRect(contour)

        boxes.append({
            "x": int(x),
            "y": int(y),
            "width": int(box_width),
            "height": int(box_height),
        })

        cv2.rectangle(
            result_image,
            (x, y),
            (x + box_width, y + box_height),
            (0, 0, 255),
            2,
        )

    needs_review = changed_percent >= 3 or similarity < 0.85

    return {
        "status": "review" if needs_review else "no_major_change",
        "message": (
            "พบความต่างจากภาพมาตรฐาน กรุณาตรวจบริเวณกรอบแดง"
            if needs_review
            else "ไม่พบความต่างมากตามเกณฑ์ทดลอง ยังต้องยืนยันด้วยคน"
        ),
        # คะแนนความคล้าย ไม่ใช่ความมั่นใจว่าเครื่องปลอดภัย
        "similarity": round(
            float(np.clip(similarity, 0, 1)) * 100, 2
        ),
        "changed_percent": round(changed_percent, 2),
        "coverage_percent": round(coverage * 100, 2),
        "boxes": boxes,
        # พิกัดกรอบอ้างอิงกับภาพผลลัพธ์ขนาดนี้
        "image_width": width,
        "image_height": height,
        "result_image": encode_image(result_image),
    }