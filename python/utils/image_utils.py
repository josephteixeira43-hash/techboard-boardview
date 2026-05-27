import cv2
import numpy as np


def to_grayscale(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        return cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    return image


def invert_if_dark(gray: np.ndarray) -> np.ndarray:
    if np.mean(gray) < 128:
        return cv2.bitwise_not(gray)
    return gray


def upscale(gray: np.ndarray, factor: float = 2.0) -> np.ndarray:
    h, w = gray.shape
    return cv2.resize(
        gray,
        (int(w * factor), int(h * factor)),
        interpolation=cv2.INTER_CUBIC,
    )


def otsu_threshold(gray: np.ndarray) -> np.ndarray:
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary
