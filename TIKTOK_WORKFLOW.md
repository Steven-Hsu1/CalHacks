# TikTok Content Filter Workflow

## Current Implementation (Fixed)

### TikTok Button Selectors

**Three Dots Button (More Actions):**
```css
button.TUXButton.TUXButton--capsule.TUXButton--medium.TUXButton--secondary.action-item.css-7a914j
```

**Not Interested Menu Item:**
```css
div.TUXMenuItem[data-e2e="more-menu-popover_not-interested"]
```

**Next Video Button:**
```css
button.TUXButton.TUXButton--capsule.TUXButton--medium.TUXButton--secondary.action-item.css-16m89jc
```

## Workflow Logic

### 1. When Trigger IS Detected

If a trigger word (e.g., "valorant") is detected in the video:

1. **Click Three Dots** → Opens menu
2. **Wait 800ms** → Let menu appear
3. **Click "Not Interested"** → Removes video from feed
4. **Reset timer** → Start tracking new video

### 2. When NO Trigger + Video Finished (30s)

If no trigger is detected AND video has been watched for 30 seconds:

1. **Click Next Video Button** → Skip to next video
2. **If button not found** → Fallback to scroll down
3. **Reset timer** → Start tracking new video

## Configuration

### Video Watch Duration

Default: **30 seconds** (configurable)

Set in `.env`:
```
MAX_VIDEO_WATCH_DURATION=30
```

### Frame Analysis Rate

Default: **1 frame per second**

## Debugging

### Check Agent Logs

When trigger detected:
```
🚨 TRIGGER DETECTED: valorant (confidence: 0.85)
🔧 Sending TikTok two-step 'Not interested' click commands to extension...
Step 1: Sending click command for 3 dots button: button.TUXButton...css-7a914j
Step 2: Sending click command for 'Not interested': div.TUXMenuItem[data-e2e="more-menu-popover_not-interested"]
```

When no trigger + video ends:
```
⏱️  TikTok video watched for 30.2s (max: 30s)
✅ No trigger detected in this video - skipping to next
📤 Sending click command for TikTok next video button: button.TUXButton...css-16m89jc
```

### Check Extension Console

Success:
```
[Content] Attempting to click selector: button.TUXButton...css-7a914j
[Content] Found element: button.TUXButton...
[Content] ✅ Clicked: button.TUXButton...css-7a914j
```

Failure:
```
[Content] ⚠️  Could not find element with selector: button.TUXButton...
[Content] No next button found, scrolling down instead
```

## Common Issues

### Buttons Not Found

**Possible causes:**
1. TikTok updated their UI classes
2. Page not fully loaded
3. Video player in different state

**Fix:**
- Inspect element in Chrome DevTools
- Update selectors in `agent/main.py` and `extension/background/background.js`

### Video End Not Detected

**Possible causes:**
1. Timer not resetting after navigation
2. Video shorter than 30 seconds

**Fix:**
- Check `self.video_start_time` is reset after each navigation
- Adjust `MAX_VIDEO_WATCH_DURATION` in `.env`

### Triggers Not Working

**Possible causes:**
1. Triggers not set in extension popup
2. OpenAI not detecting the trigger word

**Fix:**
- Check extension popup has triggers listed
- Check agent logs for "Initialized with N trigger(s)"
- Verify OpenAI is returning exact trigger name

## Testing

1. **Set trigger:** Open extension → Add "valorant" as trigger
2. **Start monitoring:** Click "Start Monitoring" → Select TikTok tab
3. **Test trigger:** Find video with "valorant" → Should click "Not interested"
4. **Test navigation:** Watch boring video for 30s → Should skip to next
5. **Check logs:** Agent terminal + Extension console for errors