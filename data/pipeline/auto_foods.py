"""Rules for automatically including USDA SR Legacy foods in the planner.

Curated foods (foods_catalogue.json) are the "common" set, switched on by
default and given friendly names and units. Everything else that passes the
rules below is added too, switched off by default, so people can add it from
the food list. All rules are plain data so they are easy to review and edit.
"""
from __future__ import annotations

import re

# Planner categories (level 1 of the food list), in display order.
CATEGORIES = [
    ("veg", "Vegetables"),
    ("fruit", "Fruit"),
    ("pulses", "Beans, lentils & soya"),
    ("grains", "Grains, bread & pasta"),
    ("cereals", "Breakfast cereals"),
    ("nuts", "Nuts & seeds"),
    ("meat", "Meat & poultry"),
    ("fish", "Fish & seafood"),
    ("dairy", "Dairy & eggs"),
    ("drinks", "Plant drinks"),
    ("oils", "Oils & fats"),
    ("herbs", "Herbs & spices"),
    ("other", "Other"),
]

# USDA SR Legacy food_category_id -> planner category
USDA_CATEGORY = {
    "11": "veg", "9": "fruit", "16": "pulses", "20": "grains", "18": "grains",
    "8": "cereals", "12": "nuts", "1": "dairy", "14": "drinks", "4": "oils", "2": "herbs",
    "5": "meat", "10": "meat", "13": "meat", "17": "meat", "15": "fish",
}
MEAT_CATS = {"meat", "fish"}

# Curated catalogue "group" -> planner category
CURATED_CATEGORY = {
    "Pulses": "pulses", "Soya": "pulses", "Grains": "grains", "Starchy veg": "veg",
    "Eggs & dairy": "dairy", "Vegetables": "veg", "Fruit": "fruit", "Nuts & seeds": "nuts",
    "Oils": "oils", "Fortified": "other", "Plant drinks": "drinks", "Herbs": "herbs",
    "Meat": "meat", "Fish": "fish",
}

# Anything containing one of these (lower case) is left out.
EXCLUDE_ANY = [
    "babyfood", "baby food", "infant", "toddler", "fast food", "restaurant", "school lunch",
    "imitation", "industrial", "with salt", "heavy syrup", "light syrup", "candied", "chocolate",
    "frosted", "glazed", "fried", "french fr", "frozen dessert", "ice cream", "eggnog", "milkshake",
    "shake", "pudding", "pie filling", "cake", "cookie", "doughnut", "pastry", "croissant", "sweet roll",
    "salt, table", "cereals ready-to-eat, ", "prepared with milk", "with added nutrients",
    "souffle", "salad", "sandwich spread", "dressing", "seasoning mix", "cream substitute", "dessert topping",
    "regular pack", "seasoned", "luncheon", "sausage", "meat extender", "frankfurter", "breaded",
    "with cheese sauce", "in butter sauce", "creamed", "au gratin", "scalloped", "hash brown", "puffs",
    "freeze-dried", "incaparina", "cheese product", "cheese food", "cheese spread", "process", "dry mix",
    "vegetarian fillets", "vegetarian meatloaf", "cornstarch", "egg substitute", "whipped topping",
]
# Meat and fish words: these keep the vegetarian categories free of meat.
MEAT_WORDS = ["lard", "tallow", "beef", "pork", "chicken", "turkey", "duck", "goose", "mutton", "fish", "cod liver",
              "menhaden", "salmon", "sardine", "herring", "anchov", "bacon", "ham,", "gelatin", "meat,"]
# Meat and fish: cooked or canned foods only, lean cuts, no exotic species.
MEAT_KEEP_ANY = ("cooked", "canned", "smoked", "roasted", "broiled", "braised")
MEAT_EXCLUDE = ("raw", "separable lean and fat", "select,", "prime,", "trimmed to 1/4", "ostrich", "emu,", "squab",
                "turtle", "jellyfish", "frog", "game meat", "bison", "pheasant", "quail", "giblets", "skin only",
                "back, meat and skin", "neck", "feet", "ears", "tail", "ground, 70%", "ground, 75%", "ground, 80%",
                "pickled", "dried", "salted", "nuggets", "patties", "composite", "with added solution", "heart",
                "kidneys", "brain", "tongue", "lungs", "spleen", "pancreas", "thymus", "tripe", "chitterlings")
# Whole-word exclusions ("salted" but not "unsalted").
EXCLUDE_WORDS = re.compile(r"\b(?:salted|lightly salted)\b", re.I)
# Baked products: only these kinds of bread are kept.
BAKED_KEEP = ("bread,", "rolls,", "muffins, english", "english muffin", "bagels,", "tortillas,", "crackers,")
# Drinks category: only plant drinks are kept.
DRINKS_KEEP = ("almond milk", "rice milk", "oat milk", "coconut milk", "soy milk", "hemp")

# Brand names are written in capitals in SR Legacy descriptions.
BRAND_RE = re.compile(r"\b[A-Z][A-Z'&.]{2,}\b")

ANIMAL_WORDS = ("milk", "egg", "cheese", "butter", "cream", "whey", "yogurt", "yoghurt", "honey",
                "ghee", "casein", "lactose")
PLANT_MILK = ("soymilk", "soy milk", "almond milk", "rice milk", "oat milk", "coconut milk",
              "hemp", "cocoa butter", "peanut butter", "nut butter", "seed butter", "butternut", "buttermilk free",
              "eggplant", "egg noodles free")

# US -> UK names used when showing USDA descriptions.
UK_NAMES = [
    (r"^Beverages, almond milk", "Almond drink"),
    (r"^Beverages, rice milk", "Rice drink"),
    (r"^Beverages, coconut milk", "Coconut drink"),
    (r"^(?:Nuts|Seeds|Spices|Cereals|Beverages), ", ""),
    (r"^Chicken, broilers or fryers", "Chicken"),
    (r"^Pork, fresh", "Pork"),
    (r"^Lamb, domestic", "Lamb"),
    (r"^Lamb, (?:New Zealand|Australian), imported(?:, (?:fresh|frozen))?", "Lamb (imported)"),
    (r"^Beef, variety meats and by-products", "Offal (beef)"),
    (r"^(?:Crustaceans|Mollusks), ", "Shellfish, "),
    (r", separable lean only", ", lean"),
    (r"\bshrimp\b", "prawns"),
    (r"Chickpeas \(garbanzo beans, bengal gram\)", "Chickpeas"),
    (r"\bgarbanzo beans\b", "chickpeas"),
    (r"Oil, canola", "Oil, rapeseed (canola)"),
    (r"Squash, summer, zucchini", "Courgette"),
    (r"\bzucchini\b", "courgette"),
    (r"\bEggplant\b", "Aubergine"),
    (r"Coriander \(cilantro\) leaves", "Coriander leaves"),
    (r"\bArugula\b", "Rocket"),
    (r"\bRutabagas\b", "Swede"),
    (r"Onions, spring or scallions", "Spring onions"),
    (r"Beans, snap, green", "Green beans"),
    (r"Beans, snap", "Green beans"),
    (r"Lima beans", "Butter beans (lima)"),
    (r"Beans, navy", "Haricot beans (navy)"),
    (r"\bBeets\b", "Beetroot"),
    (r"Corn, sweet, yellow", "Sweetcorn"),
    (r"Corn, sweet, white", "Sweetcorn, white"),
    (r"Peppers, sweet", "Peppers"),
    (r"Lettuce, cos or romaine", "Lettuce, cos"),
    (r"Peas, edible-podded", "Mangetout"),
    (r"\bYogurt\b", "Yoghurt"),
    (r"\byogurt\b", "yoghurt"),
    (r"\bSoymilk\b", "Soya drink"),
    (r"\bfiber\b", "fibre"),
    (r"\bflavor\b", "flavour"),
    (r"\b[Ff]lavors\b", "flavours"),
    (r"\bcolor\b", "colour"),
]
PARENS_DROP = re.compile(r"\s*\((?:Includes foods for USDA's Food Distribution Program|includes [^)]*)\)", re.I)

# First words that are too generic to group by on their own (group by two parts instead).
GENERIC_FIRST = {
    "beans", "peas", "nuts", "seeds", "cheese", "oil", "rice", "flour", "squash", "lettuce", "peppers",
    "mushrooms", "cereals", "bread", "milk", "yoghurt", "wheat", "corn", "lentils", "cabbage", "onions",
    "potatoes", "tomatoes", "apples", "grapes", "melons", "plums", "oranges", "spices", "egg", "cream",
    "soy", "pasta", "noodles", "rolls", "crackers", "beverages", "tortillas", "mustard greens", "spinach",
    "carrots", "broccoli", "kale", "chard", "beet greens", "seaweed",
    "chicken", "turkey", "pork", "beef", "lamb", "lamb (imported)", "veal", "fish", "shellfish", "duck", "goose", "offal (beef)",
}


def uk_name(desc: str) -> str:
    s = PARENS_DROP.sub("", desc)
    for pat, rep in UK_NAMES:
        s = re.sub(pat, rep, s)
    s = s.strip().rstrip(",")
    return s[:1].upper() + s[1:]


def group_and_variant(name: str) -> tuple[str, str]:
    parts = [p.strip() for p in name.split(",") if p.strip()]
    if not parts:
        return name, ""
    n = 2 if parts[0].lower() in GENERIC_FIRST and len(parts) > 1 else 1
    group = ", ".join(parts[:n])
    group = group[0].upper() + group[1:].lower()
    variant = ", ".join(parts[n:]) or "plain"
    return group, variant


def diet_for(category: str, desc: str) -> str:
    d = desc.lower()
    if category in MEAT_CATS:
        return "meat"
    if category == "dairy":
        return "vegetarian"
    cleaned = d
    for w in PLANT_MILK:
        cleaned = cleaned.replace(w, "")
    return "vegetarian" if any(w in cleaned for w in ANIMAL_WORDS) else "vegan"


def amounts_for(category: str, desc: str) -> tuple[float, int]:
    """(step grams, max grams per day) for an automatically added food."""
    d = desc.lower()
    dry = any(w in d for w in ("dry", "dried", "dehydrated", "powder", "flour", "meal,", "bran", "germ", "flakes"))
    if category == "herbs":
        return 1, 5
    if category in MEAT_CATS:
        if "liver" in d:
            return 10, 100
        return 10, 300
    if category == "oils":
        return 5, 40
    if category == "nuts":
        return 5, 50 if "butter" in d or "paste" in d else 60
    if category == "dairy":
        if "cheese" in d:
            return 5, 100
        if any(w in d for w in ("dry", "dried", "powder")):
            return 5, 40
        if "milk" in d or "buttermilk" in d:
            return 50, 800
        if "yoghurt" in d or "yogurt" in d:
            return 10, 500
        if "egg" in d:
            return 10, 200
        if "butter" in d or "cream" in d:
            return 5, 40
        return 10, 200
    if category == "drinks":
        return 50, 800
    if category == "fruit":
        if "juice" in d:
            return 50, 250
        if dry or any(w in d for w in ("raisin", "prune", "dates", "currant", "sultana")):
            return 5, 80
        return 10, 400
    if category == "veg":
        if dry or "seaweed" in d:
            return 5, 30
        return 10, 400
    if category == "pulses":
        if "tofu" in d or "tempeh" in d:
            return 10, 300
        if dry or "raw" in d or "mature seeds, raw" in d:
            return 10, 150
        return 10, 400
    if category == "grains":
        if any(w in d for w in ("bread", "rolls", "muffin", "bagel", "tortilla")):
            return 10, 300
        if "crackers" in d:
            return 5, 60
        if dry or "raw" in d or "uncooked" in d:
            return 10, 150
        return 10, 500
    if category == "cereals":
        return 10, 100
    return 10, 200


def auto_include(cat_id: str, desc: str) -> str | None:
    """Return the planner category if this SR Legacy food should be included automatically."""
    category = USDA_CATEGORY.get(cat_id)
    if not category:
        return None
    d = desc.lower()
    if any(w in d for w in EXCLUDE_ANY) or EXCLUDE_WORDS.search(desc):
        return None
    if category in MEAT_CATS:
        if not any(w in d for w in MEAT_KEEP_ANY) or any(w in d for w in MEAT_EXCLUDE):
            return None
        if BRAND_RE.search(desc):
            return None
        return category
    if any(w in d for w in MEAT_WORDS):
        return None
    if BRAND_RE.search(desc):
        return None
    if cat_id == "18" and not d.startswith(BAKED_KEEP):
        return None
    if cat_id == "14" and not any(w in d for w in DRINKS_KEEP):
        return None
    if cat_id == "8" and d.startswith("cereals ready-to-eat"):
        return None
    if cat_id == "4" and any(w in d for w in ("shortening", "fat, ", "margarine-like", "salad dressing", "mayonnaise")):
        return None
    return category
