import sys
import argparse
from PIL import Image, ImageEnhance
try:
    import pyfiglet
except ImportError:
    pyfiglet = None

def text_to_ascii(text, font='standard'):
    if not pyfiglet:
        return "Error: pyfiglet not installed. Run `pip install pyfiglet`."
    try:
        return pyfiglet.figlet_format(text, font=font)
    except Exception as e:
        return f"Error generating text art: {e}"

def image_to_ascii(image_path, width=100, style='detailed', background='dark'):
    try:
        img = Image.open(image_path)
    except Exception as e:
        return f"Error opening image: {e}"

    # Calculate height
    aspect_ratio = img.height / img.width
    new_height = int(aspect_ratio * width * 0.55) 
    img = img.resize((width, new_height), Image.Resampling.LANCZOS)
    
    img = img.convert('L') # Grayscale
    
    # Simple contrast enhancement
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.5)

    # Character sets ordered by density (Dense -> Light)
    # Dense chars use more pixels (look white on dark bg, black on light bg)
    chars_map = {
        'detailed': "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
        'ink': "@%#*+=-:. ",
        'minimal': "@#=-. ",
        'dots': "#:."
    }
    
    chars = chars_map.get(style, chars_map['detailed'])
    
    # Logic for mapping pixels (0-255) to index
    # 0 = Black, 255 = White
    
    # If background='dark' (Terminal):
    # We want Bright parts (255) to be Dense Chars (@) (because @ is white ink)
    # We want Dark parts (0) to be Light Chars ( ) (because space is black bg)
    # So: 255 -> Index 0 (@), 0 -> Index Last ( )
    # Mapping: Invert pixel value before mapping OR reverse char string.
    
    # If background='light' (Notepad/Paper):
    # We want Dark parts (0) to be Dense Chars (@) (because @ is black ink)
    # We want Bright parts (255) to be Light Chars ( ) (because space is white paper)
    # So: 0 -> Index 0 (@), 255 -> Index Last ( )
    
    pixels = list(img.getdata())
    ascii_str = ""
    
    for i, pixel in enumerate(pixels):
        if i % width == 0 and i != 0:
            ascii_str += "\n"
        
        if background == 'dark':
            # 255(White) should map to 0 (Dense)
            # 0(Black) should map to Max (Light)
            # So we invert the pixel value logic: 
            # val = 255 - pixel
            pixel_val = 255 - pixel
        else:
            # background == 'light'
            # 0(Black) maps to 0 (Dense)
            # 255(White) maps to Max (Light)
            pixel_val = pixel
            
        char_index = pixel_val * (len(chars) - 1) // 255
        ascii_str += chars[char_index]
            
    return ascii_str

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate ASCII art from text or images.")
    subparsers = parser.add_subparsers(dest='command', required=True)

    # Text command
    text_parser = subparsers.add_parser('text', help='Convert text to ASCII banner')
    text_parser.add_argument('text', type=str, help='The text to convert')
    text_parser.add_argument('--font', type=str, default='standard', help='Font style')

    # Image command
    img_parser = subparsers.add_parser('image', help='Convert image to ASCII')
    img_parser.add_argument('path', type=str, help='Path to image file')
    img_parser.add_argument('--width', type=int, default=100, help='Output width in characters')
    img_parser.add_argument('--style', type=str, default='detailed', choices=['detailed', 'ink', 'minimal', 'dots'], help='Character style')
    img_parser.add_argument('--background', type=str, default='dark', choices=['dark', 'light'], help='Target background color (dark for terminal, light for file)')

    args = parser.parse_args()

    if args.command == 'text':
        print(text_to_ascii(args.text, args.font))
    elif args.command == 'image':
        print(image_to_ascii(args.path, args.width, args.style, args.background))
