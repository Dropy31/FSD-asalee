from PIL import Image
import sys
import os

def process_logo(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()
        
        newData = []
        
        # Pass 1: Filter Background and Grey Text
        # Keep only "Colorful" pixels (Blue/Green).
        
        for item in datas:
            r, g, b, a = item
            
            # Color Difference (Max - Min)
            # Grey/White has low difference.
            # Blue/Green has high difference.
            
            diff = max(r, g, b) - min(r, g, b)
            brightness = (r + g + b) / 3
            
            is_keep = False
            
            # Keep if:
            # 1. Significant color difference ( It's colored! )
            if diff > 15: 
                is_keep = True
                
            # Filter out if it's too bright (White background even if slight noise)
            # But be careful with Light Green.
            # Light Green (220, 255, 220) -> Diff 35. Keep.
            # White (250, 255, 250) -> Diff 5. Kill.
            
            # What about the Grey Text?
            # Grey Text (100, 100, 100) -> Diff 0. Kill.
            
            if is_keep:
                newData.append(item)
            else:
                newData.append((255, 255, 255, 0))
        
        img.putdata(newData)
        
        # Pass 2: Segmentation (Vertical Split)
        width, height = img.size
        pixels = img.load()
        
        col_has_pixel = []
        for x in range(width):
            has_pixel = False
            for y in range(height):
                if pixels[x, y][3] > 0: # Non-transparent
                    has_pixel = True
                    break
            col_has_pixel.append(has_pixel)
            
        # Group columns into segments
        segments = []
        in_segment = False
        start_x = 0
        
        for x in range(width):
            if col_has_pixel[x]:
                if not in_segment:
                    in_segment = True
                    start_x = x
            else:
                if in_segment:
                    in_segment = False
                    segments.append((start_x, x)) # End is exclusive
        
        if in_segment:
             segments.append((start_x, width))
             
        print(f"Raw Segments: {segments}")
        
        # Merge close segments (Letters in PROSPER might be separated by small gaps)
        # Gap threshold ~ 20px? Shield-Text gap was 35px. Letter gap is probably < 10px.
        
        merged_segments = []
        if segments:
            curr_start, curr_end = segments[0]
            for i in range(1, len(segments)):
                next_start, next_end = segments[i]
                gap = next_start - curr_end
                
                if gap < 25: # Merge if gap is small
                    curr_end = next_end
                else:
                    merged_segments.append((curr_start, curr_end))
                    curr_start, curr_end = next_start, next_end
            merged_segments.append((curr_start, curr_end))
            
        print(f"Merged Segments: {merged_segments}")
        
        # We expect: Segment 1 (Shield), Segment 2 (Text).
        # We want to keep Segment 2.
        
        final_img = img
        
        if len(merged_segments) >= 2:
            # Assume second segment is the text
            text_start, text_end = merged_segments[1]
            # Verify width
            seg_width = text_end - text_start
            print(f"Selecting Segment 2: {text_start}-{text_end} (Width: {seg_width})")
            
            # Crop to this segment (Full height)
            final_img = img.crop((text_start, 0, text_end, height))
            
        elif len(merged_segments) == 1:
            print("Only 1 segment found. Checking size.")
            # Maybe Only Text? Or Only Shield?
            # Shield is on Left. If start > 100, maybe it's text?
            # Or if user provided cropped image?
            start, end = merged_segments[0]
            if start > 200:
                print("Segment starts late, assuming it is Text (Shield removed?)")
                final_img = img.crop((start, 0, end, height))
            else:
                 # Just crop the content
                 print("Cropping content.")
                 final_img = img.crop((start, 0, end, height))
        
        # Final Vertical Crop
        bbox = final_img.getbbox()
        if bbox:
            final_img = final_img.crop(bbox)

        print(f"Saving to {output_path}")
        final_img.save(output_path, "PNG")
        print("Done.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    process_logo(r"C:/Users/valen/.gemini/antigravity/brain/170d3841-41fa-43c3-b4db-30d24bee412a/uploaded_media_1770030699636.png", "src/renderer/assets/logo_text.png")
