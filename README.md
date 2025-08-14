# Health-Food-Checker-Project-Test-1
# HealthyMenu (MV3)

### Install (Developer Mode)
1. Download this folder to your computer.
2. Open **chrome://extensions**.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** and select the `healthy-menu` folder.

### Use on DoorDash & UberEats
- Navigate to a restaurant menu page. Badges appear on item cards.
- Click **Details** on any badge to open the right-side panel.
- If nutrition facts aren’t visible, enter what you know in **Refine data** to update the score.

### Import Food
- Click the extension icon to open the popup.
- Paste a nutrition label **or** type values, then **Score**.
- Adjust preferences (sugar/sodium sensitivity, vegetarian emphasis) and **Save**.

### Scoring Summary
- **Negative points**: high calories, saturated fat, sodium, added sugars, trans fat, processing (fried, processed meats, sweet beverages).
- **Positive points**: fiber, protein (with diminishing returns), whole grains, vegetables, lean proteins, good cooking methods.
- Final score = clamp(60 + positives − negatives, 0, 100). Color scales Red→Yellow→Green with a pointer.

### Limits
- Selectors may change on app updates — the MutationObserver embraces multiple patterns but may need tweaks.
- Some menus hide nutrition; the estimator uses conservative heuristics.
- Educational tool; not individualized nutrition advice.

### Customize
- Tweak thresholds/weights in `contentScript.js` and `popup.js` (search `scoreFood`).
<img width="468" height="522" alt="image" src="https://github.com/user-attachments/assets/892c5cf1-09af-443e-86d5-4603f474055c" />
