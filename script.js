"use strict";

const defaultProducts = [
    {
        id: 1,
        name: "Ú©ÛŒØ¨ÙˆØ±Ø¯ Ù…Ú©Ø§Ù†ÛŒÚ©ÛŒ Nova K87",
        brand: "HYPERSTRIKE",
        icon: "fa-keyboard",
        accent: "#00d4ff",
        tag: "Ù¾Ø±ÙØ±ÙˆØ´",
        price: 3450000,
        stock: 14,
        rating: 4.9,
        reviews: 128,
        shortDescription: "Ú©ÛŒØ¨ÙˆØ±Ø¯ Ù…Ú©Ø§Ù†ÛŒÚ©ÛŒ TKL Ø¨Ø§ Ø³ÙˆÛŒÛŒÚ†â€ŒÙ‡Ø§ÛŒ Ø³Ø±ÛŒØ¹ØŒ Ù†ÙˆØ±Ù¾Ø±Ø¯Ø§Ø²ÛŒ RGB Ùˆ Ø¨Ø¯Ù†Ù‡ Ø¢Ù„ÙˆÙ…ÛŒÙ†ÛŒÙˆÙ…ÛŒ.",
        description: "Nova K87 Ø¨Ø±Ø§ÛŒ ÙˆØ§Ú©Ù†Ø´ Ø³Ø±ÛŒØ¹ Ùˆ Ú©Ù†ØªØ±Ù„ Ø¯Ù‚ÛŒÙ‚ Ø¯Ø± Ø¨Ø§Ø²ÛŒâ€ŒÙ‡Ø§ÛŒ Ø±Ù‚Ø§Ø¨ØªÛŒ Ø·Ø±Ø§Ø­ÛŒ Ø´Ø¯Ù‡ Ø§Ø³Øª. ÙØ±Ù… Ø¬Ù…Ø¹â€ŒÙˆØ¬ÙˆØ± Ø¢Ù† ÙØ¶Ø§ÛŒ Ø¨ÛŒØ´ØªØ±ÛŒ Ø¨Ø±Ø§ÛŒ Ø­Ø±Ú©Øª Ù…ÙˆØ³ Ø§ÛŒØ¬Ø§Ø¯ Ù…ÛŒâ€ŒÚ©Ù†Ø¯ Ùˆ Ù†ÙˆØ±Ù¾Ø±Ø¯Ø§Ø²ÛŒ Ù‚Ø§Ø¨Ù„ ØªÙ†Ø¸ÛŒÙ…ØŒ Ø¸Ø§Ù‡Ø± Ø³ØªØ§Ù¾ Ø´Ù…Ø§ Ø±Ø§ Ú©Ø§Ù…Ù„ Ù…ÛŒâ€ŒØ³Ø§Ø²Ø¯.",
        features: ["Ø³ÙˆÛŒÛŒÚ† Ù…Ú©Ø§Ù†ÛŒÚ©ÛŒ Ø®Ø·ÛŒ", "Ù†ÙˆØ±Ù¾Ø±Ø¯Ø§Ø²ÛŒ RGB Ù‚Ø§Ø¨Ù„ ØªÙ†Ø¸ÛŒÙ…", "Ø§ØªØµØ§Ù„ USB-C Ø¬Ø¯Ø§Ø´ÙˆÙ†Ø¯Ù‡", "Anti-Ghosting Ú©Ø§Ù…Ù„", "Ú©Ù„ÛŒØ¯Ù‡Ø§ÛŒ Ù…Ù‚Ø§ÙˆÙ… PBT", "Ø¨Ø¯Ù†Ù‡ Ø¢Ù„ÙˆÙ…ÛŒÙ†ÛŒÙˆÙ…ÛŒ"],
        guarantee: "Û±Û¸ Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "Ú©ÛŒØ¨ÙˆØ±Ø¯ Ú¯ÛŒÙ…ÛŒÙ†Ú¯"
    },
    {
        id: 2,
        name: "Ù…ÙˆØ³ Ø¨ÛŒâ€ŒØ³ÛŒÙ… Pulse X1",
        brand: "VORTEX",
        icon: "fa-computer-mouse",
        accent: "#00ff66",
        tag: "ÙÙˆÙ‚ Ø³Ø¨Ú©",
        price: 2890000,
        stock: 21,
        rating: 4.8,
        reviews: 96,
        shortDescription: "Ù…ÙˆØ³ ÙÙˆÙ‚ Ø³Ø¨Ú© Û¶Û³ Ú¯Ø±Ù…ÛŒ Ø¨Ø§ Ø³Ù†Ø³ÙˆØ± Û²Û¶Û°Û°Û° DPI Ùˆ Ø§ØªØµØ§Ù„ Ø¨ÛŒâ€ŒØ³ÛŒÙ… Ú©Ù…â€ŒØªØ£Ø®ÛŒØ±.",
        description: "Pulse X1 ØªØ±Ú©ÛŒØ¨ÛŒ Ø§Ø² ÙˆØ²Ù† Ú©Ù…ØŒ Ø¯Ù‚Øª Ø¨Ø§Ù„Ø§ Ùˆ Ø§ØªØµØ§Ù„ Ù¾Ø§ÛŒØ¯Ø§Ø± Ø§Ø³Øª. Ø·Ø±Ø§Ø­ÛŒ Ø§Ø±Ú¯ÙˆÙ†ÙˆÙ…ÛŒÚ© Ùˆ Ø¨Ø§ØªØ±ÛŒ Ø¨Ø§Ø¯ÙˆØ§Ù… Ø¢Ù† Ø¨Ø±Ø§ÛŒ Ø¬Ù„Ø³Ø§Øª Ø·ÙˆÙ„Ø§Ù†ÛŒ Ø¨Ø§Ø²ÛŒ Ùˆ Ø±Ù‚Ø§Ø¨Øªâ€ŒÙ‡Ø§ÛŒ Ø­Ø³Ø§Ø³ Ø¹Ù…Ù„Ú©Ø±Ø¯ÛŒ Ù…Ø·Ù…Ø¦Ù† ÙØ±Ø§Ù‡Ù… Ù…ÛŒâ€ŒÚ©Ù†Ø¯.",
        features: ["Ø³Ù†Ø³ÙˆØ± Û²Û¶Û°Û°Û° DPI", "ÙˆØ²Ù† Û¶Û³ Ú¯Ø±Ù…", "Ø§ØªØµØ§Ù„ 2.4GHz", "Ø¹Ù…Ø± Ø¨Ø§ØªØ±ÛŒ Û·Û° Ø³Ø§Ø¹ØªÙ‡", "Ø´Ø´ Ú©Ù„ÛŒØ¯ Ù‚Ø§Ø¨Ù„ Ø¨Ø±Ù†Ø§Ù…Ù‡â€ŒØ±ÛŒØ²ÛŒ", "Ù¾Ø§ÛŒÙ‡â€ŒÙ‡Ø§ÛŒ PTFE"],
        guarantee: "Û±Û² Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "Ù…ÙˆØ³ Ú¯ÛŒÙ…ÛŒÙ†Ú¯"
    },
    {
        id: 3,
        name: "Ù‡Ø¯Ø³Øª ÙØ±Ø§Ú¯ÛŒØ± Sonic Pro",
        brand: "NEXUS AUDIO",
        icon: "fa-headphones",
        accent: "#8b5cf6",
        tag: "ØµØ¯Ø§ÛŒ 7.1",
        price: 4680000,
        stock: 9,
        rating: 4.7,
        reviews: 174,
        shortDescription: "Ù‡Ø¯Ø³Øª Ø±Ø§Ø­Øª Ø¨Ø§ ØµØ¯Ø§ÛŒ ÙØ±Ø§Ú¯ÛŒØ± 7.1ØŒ Ù…ÛŒÚ©Ø±ÙˆÙÙˆÙ† Ø­Ø°Ù Ù†ÙˆÛŒØ² Ùˆ Ø¯Ø±Ø§ÛŒÙˆØ±Ù‡Ø§ÛŒ ÛµÛ° Ù…ÛŒÙ„ÛŒâ€ŒÙ…ØªØ±ÛŒ.",
        description: "Sonic Pro ØµØ¯Ø§ÛŒÛŒ Ø¯Ù‚ÛŒÙ‚ Ùˆ Ø¬Ù‡Øªâ€ŒØ¯Ø§Ø± Ø§Ø±Ø§Ø¦Ù‡ Ù…ÛŒâ€ŒØ¯Ù‡Ø¯ ØªØ§ Ú©ÙˆÚ†Ú©â€ŒØªØ±ÛŒÙ† Ø¬Ø²Ø¦ÛŒØ§Øª Ù…Ø­ÛŒØ· Ø¨Ø§Ø²ÛŒ Ø±Ø§ Ø¨Ø´Ù†ÙˆÛŒØ¯. Ú¯ÙˆØ´ÛŒâ€ŒÙ‡Ø§ÛŒ Ù†Ø±Ù… Ùˆ Ù…ÛŒÚ©Ø±ÙˆÙÙˆÙ† Ø´ÙØ§Ù Ø¢Ù† Ø¨Ø±Ø§ÛŒ Ø¨Ø§Ø²ÛŒ ØªÛŒÙ…ÛŒ Ùˆ Ø§Ø³ØªÙØ§Ø¯Ù‡ Ø·ÙˆÙ„Ø§Ù†ÛŒ Ø§ÛŒØ¯Ù‡â€ŒØ¢Ù„ Ù‡Ø³ØªÙ†Ø¯.",
        features: ["ØµØ¯Ø§ÛŒ Ù…Ø¬Ø§Ø²ÛŒ 7.1", "Ø¯Ø±Ø§ÛŒÙˆØ± ÛµÛ° Ù…ÛŒÙ„ÛŒâ€ŒÙ…ØªØ±ÛŒ", "Ù…ÛŒÚ©Ø±ÙˆÙÙˆÙ† Ø­Ø°Ù Ù†ÙˆÛŒØ²", "Ù¾Ø¯ Ù…Ù…ÙˆØ±ÛŒâ€ŒÙÙˆÙ…", "Ú©Ù†ØªØ±Ù„ ØµØ¯Ø§ Ø±ÙˆÛŒ Ú¯ÙˆØ´ÛŒ", "Ø§ØªØµØ§Ù„ USB Ùˆ Ø¬Ú© 3.5"],
        guarantee: "Û²Û´ Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "Ù‡Ø¯Ø³Øª Ú¯ÛŒÙ…ÛŒÙ†Ú¯"
    },
    {
        id: 4,
        name: "ØµÙ†Ø¯Ù„ÛŒ Ú¯ÛŒÙ…ÛŒÙ†Ú¯ Titan X",
        brand: "RACER SEAT",
        icon: "fa-chair",
        accent: "#ff4d6d",
        tag: "Ø§Ø±Ú¯ÙˆÙ†ÙˆÙ…ÛŒÚ©",
        price: 14980000,
        stock: 5,
        rating: 4.9,
        reviews: 203,
        shortDescription: "ØµÙ†Ø¯Ù„ÛŒ Ø§Ø±Ú¯ÙˆÙ†ÙˆÙ…ÛŒÚ© Ø¨Ø§ ØªÚ©ÛŒÙ‡â€ŒÚ¯Ø§Ù‡ Ù‚Ø§Ø¨Ù„ ØªÙ†Ø¸ÛŒÙ…ØŒ Ø¯Ø³ØªÙ‡â€ŒÙ‡Ø§ÛŒ Ú†Ù‡Ø§Ø±Ø¨Ø¹Ø¯ÛŒ Ùˆ ÙØ±ÛŒÙ… ÙÙ„Ø²ÛŒ.",
        description: "Titan X Ø¨Ø±Ø§ÛŒ Ø­ÙØ¸ ÙˆØ¶Ø¹ÛŒØª ØµØ­ÛŒØ­ Ø¨Ø¯Ù† Ø¯Ø± Ø³Ø§Ø¹Øªâ€ŒÙ‡Ø§ÛŒ Ø·ÙˆÙ„Ø§Ù†ÛŒ Ø·Ø±Ø§Ø­ÛŒ Ø´Ø¯Ù‡ Ø§Ø³Øª. ØªÙ†Ø¸ÛŒÙ…Ø§Øª Ú¯Ø³ØªØ±Ø¯Ù‡ØŒ Ù…ØªØ±ÛŒØ§Ù„ Ù…Ù‚Ø§ÙˆÙ… Ùˆ Ø¨Ø§Ù„Ø´ØªÚ©â€ŒÙ‡Ø§ÛŒ Ø­Ù…Ø§ÛŒØªÛŒØŒ Ø±Ø§Ø­ØªÛŒ Ùˆ ØªÙ…Ø±Ú©Ø² Ø´Ù…Ø§ Ø±Ø§ Ø§ÙØ²Ø§ÛŒØ´ Ù…ÛŒâ€ŒØ¯Ù‡Ù†Ø¯.",
        features: ["ØªÚ©ÛŒÙ‡â€ŒÚ¯Ø§Ù‡ ØªØ§ Û±Û¶Û° Ø¯Ø±Ø¬Ù‡", "Ø¯Ø³ØªÙ‡â€ŒÙ‡Ø§ÛŒ Ú†Ù‡Ø§Ø±Ø¨Ø¹Ø¯ÛŒ", "ÙØ±ÛŒÙ… ÙÙˆÙ„Ø§Ø¯ÛŒ", "Ø¨Ø§Ù„Ø´ØªÚ© Ú¯Ø±Ø¯Ù† Ùˆ Ú©Ù…Ø±", "ØªØ­Ù…Ù„ ÙˆØ²Ù† ØªØ§ Û±ÛµÛ° Ú©ÛŒÙ„Ùˆ", "Ú†Ø±Ø®â€ŒÙ‡Ø§ÛŒ Ø¨ÛŒâ€ŒØµØ¯Ø§"],
        guarantee: "Û³Û¶ Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "ØµÙ†Ø¯Ù„ÛŒ Ú¯ÛŒÙ…ÛŒÙ†Ú¯"
    },
    {
        id: 5,
        name: "Ø¯Ø³ØªÙ‡ Ø¨Ø§Ø²ÛŒ Apex S5",
        brand: "APEX",
        icon: "fa-gamepad",
        accent: "#00d4ff",
        tag: "Ù†Ø³Ù„ Ø¬Ø¯ÛŒØ¯",
        price: 5280000,
        stock: 18,
        rating: 4.8,
        reviews: 312,
        shortDescription: "Ú©Ù†ØªØ±Ù„Ø± Ø¨ÛŒâ€ŒØ³ÛŒÙ… Ø¨Ø§ Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ù„Ù…Ø³ÛŒØŒ ØªØ±ÛŒÚ¯Ø± ØªØ·Ø¨ÛŒÙ‚ÛŒ Ùˆ Ø·Ø±Ø§Ø­ÛŒ Ø¯Ù‚ÛŒÙ‚ Ù†Ø³Ù„ Ø¬Ø¯ÛŒØ¯.",
        description: "Apex S5 Ø¨Ø§ Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ù„Ù…Ø³ÛŒ Ú†Ù†Ø¯Ù„Ø§ÛŒÙ‡ Ùˆ ØªØ±ÛŒÚ¯Ø±Ù‡Ø§ÛŒ ØªØ·Ø¨ÛŒÙ‚ÛŒØŒ Ø­Ø³ Ù‡Ø± Ø¨Ø±Ø®ÙˆØ±Ø¯ Ùˆ Ø­Ø±Ú©Øª Ø±Ø§ ÙˆØ§Ù‚Ø¹ÛŒâ€ŒØªØ± Ù…Ù†ØªÙ‚Ù„ Ù…ÛŒâ€ŒÚ©Ù†Ø¯. Ø§ØªØµØ§Ù„ Ø³Ø±ÛŒØ¹ Ùˆ Ø·Ø±Ø§Ø­ÛŒ Ø®ÙˆØ´â€ŒØ¯Ø³Øª Ø¢Ù† ØªØ¬Ø±Ø¨Ù‡â€ŒØ§ÛŒ Ø±ÙˆØ§Ù† Ù…ÛŒâ€ŒØ³Ø§Ø²Ø¯.",
        features: ["Ø¨Ø§Ø²Ø®ÙˆØ±Ø¯ Ù„Ù…Ø³ÛŒ Ù¾ÛŒØ´Ø±ÙØªÙ‡", "ØªØ±ÛŒÚ¯Ø±Ù‡Ø§ÛŒ ØªØ·Ø¨ÛŒÙ‚ÛŒ", "Ù…ÛŒÚ©Ø±ÙˆÙÙˆÙ† Ø¯Ø§Ø®Ù„ÛŒ", "Ø¨Ø§ØªØ±ÛŒ Ù‚Ø§Ø¨Ù„ Ø´Ø§Ø±Ú˜", "Ø¯Ø±Ú¯Ø§Ù‡ USB-C", "Ø³Ù†Ø³ÙˆØ± Ø­Ø±Ú©ØªÛŒ Ø´Ø´â€ŒÙ…Ø­ÙˆØ±Ù‡"],
        guarantee: "Û±Û¸ Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "Ú©Ù†ØªØ±Ù„Ø± Ú¯ÛŒÙ…ÛŒÙ†Ú¯"
    },
    {
        id: 6,
        name: "Ù…ÛŒÚ©Ø±ÙˆÙÙˆÙ† Stream Core",
        brand: "BROADCAST LAB",
        icon: "fa-microphone-lines",
        accent: "#00ff66",
        tag: "Ø§Ø³ØªØ±ÛŒÙ…",
        price: 6150000,
        stock: 7,
        rating: 4.6,
        reviews: 81,
        shortDescription: "Ù…ÛŒÚ©Ø±ÙˆÙÙˆÙ† USB Ú©Ø§Ù†Ø¯Ù†Ø³Ø± Ø¨Ø§ Ø§Ù„Ú¯ÙˆÛŒ Ú©Ø§Ø±Ø¯ÛŒÙˆØ¦ÛŒØ¯ Ùˆ Ú©Ù†ØªØ±Ù„ Ù…Ø³ØªÙ‚ÛŒÙ… Ø¨Ø±Ø§ÛŒ Ø§Ø³ØªØ±ÛŒÙ….",
        description: "Stream Core ØµØ¯Ø§ÛŒÛŒ Ú¯Ø±Ù… Ùˆ ÙˆØ§Ø¶Ø­ Ø¨Ø±Ø§ÛŒ Ø§Ø³ØªØ±ÛŒÙ…ØŒ Ù¾Ø§Ø¯Ú©Ø³Øª Ùˆ Ú¯ÙØªâ€ŒÙˆÚ¯ÙˆÛŒ ØªÛŒÙ…ÛŒ Ø¶Ø¨Ø· Ù…ÛŒâ€ŒÚ©Ù†Ø¯. Ù†ØµØ¨ Ø¢Ø³Ø§Ù† USB Ùˆ Ú©Ù†ØªØ±Ù„â€ŒÙ‡Ø§ÛŒ Ø±ÙˆÛŒ Ø¨Ø¯Ù†Ù‡ØŒ Ø§Ø³ØªÙØ§Ø¯Ù‡ Ø§Ø² Ø¢Ù† Ø±Ø§ Ø³Ø±ÛŒØ¹ Ùˆ Ø¨Ø¯ÙˆÙ† Ø¯Ø±Ø¯Ø³Ø± Ù…ÛŒâ€ŒØ³Ø§Ø²Ø¯.",
        features: ["Ú©Ù¾Ø³ÙˆÙ„ Ú©Ø§Ù†Ø¯Ù†Ø³Ø±", "Ø§Ù„Ú¯ÙˆÛŒ Ú©Ø§Ø±Ø¯ÛŒÙˆØ¦ÛŒØ¯", "Ø®Ø±ÙˆØ¬ÛŒ Ù‡Ø¯ÙÙˆÙ† Ø¨Ø¯ÙˆÙ† ØªØ£Ø®ÛŒØ±", "Ú©Ù„ÛŒØ¯ Ù‚Ø·Ø¹ Ø³Ø±ÛŒØ¹ ØµØ¯Ø§", "Ù¾Ø§ÛŒÙ‡ Ø¶Ø¯ Ù„Ø±Ø²Ø´", "Ø§ØªØµØ§Ù„ Plug & Play"],
        guarantee: "Û±Û¸ Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "ØªØ¬Ù‡ÛŒØ²Ø§Øª Ø§Ø³ØªØ±ÛŒÙ…"
    },
    {
        id: 7,
        name: "SSD Ø§Ú©Ø³ØªØ±Ù†Ø§Ù„ Velocity 1TB",
        brand: "VELOCITY",
        icon: "fa-hard-drive",
        accent: "#8b5cf6",
        tag: "Ø³Ø±Ø¹Øª Ø¨Ø§Ù„Ø§",
        price: 7290000,
        stock: 11,
        rating: 4.7,
        reviews: 104,
        shortDescription: "Ø­Ø§ÙØ¸Ù‡ Ù‚Ø§Ø¨Ù„ Ø­Ù…Ù„ ÛŒÚ© ØªØ±Ø§Ø¨Ø§ÛŒØªÛŒ Ø¨Ø§ Ø³Ø±Ø¹Øª Ø®ÙˆØ§Ù†Ø¯Ù† Û±Û°ÛµÛ° Ù…Ú¯Ø§Ø¨Ø§ÛŒØª Ø¨Ø± Ø«Ø§Ù†ÛŒÙ‡.",
        description: "Velocity 1TB ÙØ¶Ø§ÛŒ Ú©Ø§ÙÛŒ Ùˆ Ø³Ø±Ø¹Øª Ø¨Ø§Ù„Ø§ Ø±Ø§ Ø¯Ø± Ø¨Ø¯Ù†Ù‡â€ŒØ§ÛŒ Ú©ÙˆÚ†Ú© Ùˆ Ù…Ù‚Ø§ÙˆÙ… Ø§Ø±Ø§Ø¦Ù‡ Ù…ÛŒâ€ŒØ¯Ù‡Ø¯. Ø¨Ø§Ø²ÛŒâ€ŒÙ‡Ø§ Ùˆ ÙØ§ÛŒÙ„â€ŒÙ‡Ø§ÛŒ Ø­Ø¬ÛŒÙ… Ø®ÙˆØ¯ Ø±Ø§ Ø³Ø±ÛŒØ¹ Ø¬Ø§Ø¨Ù‡â€ŒØ¬Ø§ Ú©Ù†ÛŒØ¯ Ùˆ Ù‡Ù…ÛŒØ´Ù‡ Ù‡Ù…Ø±Ø§Ù‡ Ø¯Ø§Ø´ØªÙ‡ Ø¨Ø§Ø´ÛŒØ¯.",
        features: ["Ø¸Ø±ÙÛŒØª ÛŒÚ© ØªØ±Ø§Ø¨Ø§ÛŒØª", "Ø³Ø±Ø¹Øª Ø®ÙˆØ§Ù†Ø¯Ù† Û±Û°ÛµÛ°MB/s", "Ø¯Ø±Ú¯Ø§Ù‡ USB 3.2 Gen 2", "Ø¨Ø¯Ù†Ù‡ Ù…Ù‚Ø§ÙˆÙ… Ø¯Ø± Ø¨Ø±Ø§Ø¨Ø± Ø¶Ø±Ø¨Ù‡", "Ø³Ø§Ø²Ú¯Ø§Ø± Ø¨Ø§ PC Ùˆ Ú©Ù†Ø³ÙˆÙ„", "Ú©Ø§Ø¨Ù„ USB-C Ù‡Ù…Ø±Ø§Ù‡"],
        guarantee: "Û¶Û° Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "Ø­Ø§ÙØ¸Ù‡ Ú¯ÛŒÙ…ÛŒÙ†Ú¯"
    },
    {
        id: 8,
        name: "Ø®Ù†Ú©â€ŒÚ©Ù†Ù†Ø¯Ù‡ Ù„Ù¾â€ŒØªØ§Ù¾ Frost 6",
        brand: "ARCTIC GEAR",
        icon: "fa-fan",
        accent: "#00d4ff",
        tag: "Ø´Ø´ ÙÙ†",
        price: 2380000,
        stock: 16,
        rating: 4.5,
        reviews: 67,
        shortDescription: "Ù¾Ø¯ Ø®Ù†Ú©â€ŒÚ©Ù†Ù†Ø¯Ù‡ Ø´Ø´â€ŒÙÙ† Ø¨Ø§ Ù†ÙˆØ± RGB Ùˆ Ù¾Ù†Ø¬ Ø³Ø·Ø­ ØªÙ†Ø¸ÛŒÙ… Ø§Ø±ØªÙØ§Ø¹ Ø¨Ø±Ø§ÛŒ Ù„Ù¾â€ŒØªØ§Ù¾.",
        description: "Frost 6 Ø¬Ø±ÛŒØ§Ù† Ù‡ÙˆØ§ÛŒ Ú¯Ø³ØªØ±Ø¯Ù‡â€ŒØ§ÛŒ Ø²ÛŒØ± Ù„Ù¾â€ŒØªØ§Ù¾ Ø§ÛŒØ¬Ø§Ø¯ Ù…ÛŒâ€ŒÚ©Ù†Ø¯ Ùˆ Ø¨Ù‡ Ø­ÙØ¸ Ø¹Ù…Ù„Ú©Ø±Ø¯ Ù¾Ø§ÛŒØ¯Ø§Ø± Ø¯Ø± Ø¨Ø§Ø²ÛŒâ€ŒÙ‡Ø§ÛŒ Ø³Ù†Ú¯ÛŒÙ† Ú©Ù…Ú© Ù…ÛŒâ€ŒÚ©Ù†Ø¯. Ø³Ø±Ø¹Øª ÙÙ† Ùˆ Ø²Ø§ÙˆÛŒÙ‡ Ù‚Ø±Ø§Ø±Ú¯ÛŒØ±ÛŒ Ø¨Ù‡â€ŒØ³Ø§Ø¯Ú¯ÛŒ Ù‚Ø§Ø¨Ù„ ØªÙ†Ø¸ÛŒÙ… Ø§Ø³Øª.",
        features: ["Ø´Ø´ ÙÙ† Ú©Ù…â€ŒØµØ¯Ø§", "Ú©Ù†ØªØ±Ù„ Ø³Ø±Ø¹Øª ÙÙ†", "Ù†ÙˆØ±Ù¾Ø±Ø¯Ø§Ø²ÛŒ RGB", "Ù¾Ù†Ø¬ Ø³Ø·Ø­ ØªÙ†Ø¸ÛŒÙ… Ø§Ø±ØªÙØ§Ø¹", "Ø¯Ùˆ Ø¯Ø±Ú¯Ø§Ù‡ USB", "Ù…Ù†Ø§Ø³Ø¨ Ù„Ù¾â€ŒØªØ§Ù¾ ØªØ§ Û±Û· Ø§ÛŒÙ†Ú†"],
        guarantee: "Û±Û² Ù…Ø§Ù‡ Ú¯Ø§Ø±Ø§Ù†ØªÛŒ",
        category: "Ø®Ù†Ú©â€ŒÚ©Ù†Ù†Ø¯Ù‡"
    }
];

const PRODUCTS_KEY = "gaming_store_products";
const MESSAGES_KEY = "gaming_store_messages";
const LEGACY_PRODUCT_KEYS = ["products", "store_products", "web2_products"];
const ADMIN_SESSION_KEY = "web2_admin_authenticated";
const ADMIN_PASSWORD = "GamePixel2026!";
const CART_KEY = "web2_cart";
const THEME_KEY = "web2_theme";
const DISCOUNT_KEY = "web2_discount";
const DISCOUNT_CODE = "WEB2";
const DISCOUNT_RATE = 0.1;
const USER_SESSION_KEY = "gp_user";
const ORDERS_KEY = "web2_orders";
const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short"
});

let products = [];
let adminApiMode = false;
const ADMIN_API_BASE = "/api/admin/products";
const PRODUCT_API_BASE = "/api/products";
const PRODUCT_FALLBACK_KEY = "gaming_store_products_fallback";

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function normalizeIcon(icon) {
    const iconName = String(icon || "").trim().replace(/^fa-(solid|regular|brands)\s+/, "");
    return /^fa-[a-z0-9-]+$/i.test(iconName) ? iconName : "fa-gamepad";
}

function normalizeAccent(accent) {
    const color = String(accent || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#00d4ff";
}

// Ø³Ø§Ø®ØªØ§Ø± ÛŒÚ©Ù†ÙˆØ§Ø®Øª Ù…Ø­ØµÙˆÙ„: Ù‡Ø± Ø±Ú©ÙˆØ±Ø¯ (Ø­ØªÛŒ Ø¨Ø§ Ø³Ø§Ø®ØªØ§Ø± Ù‚Ø¯ÛŒÙ…ÛŒ) Ø±Ø§ Ø¨Ù‡ Ø´Ú©Ù„ Ø§Ø³ØªØ§Ù†Ø¯Ø§Ø±Ø¯ ØªØ¨Ø¯ÛŒÙ„ Ù…ÛŒâ€ŒÚ©Ù†Ø¯.
function normalizeProduct(item) {
    if (!item || typeof item !== "object") return null;

    const rawId = Number(item.id);
    const id = Number.isFinite(rawId) && rawId > 0 ? rawId : Date.now() + Math.floor(Math.random() * 1000);
    const price = Number(item.price);
    const stockRaw = Number(item.stock);
    const ratingRaw = Number(item.rating);
    const reviewsRaw = Number(item.reviews);

    let features = [];
    if (Array.isArray(item.features)) {
        features = item.features.map((feature) => String(feature)).filter(Boolean);
    } else if (item.specs && typeof item.specs === "object") {
        features = Object.entries(item.specs).map(([key, value]) => `${key}: ${value}`);
    } else if (item.specifications && typeof item.specifications === "object") {
        features = Object.entries(item.specifications).map(([key, value]) => `${key}: ${value}`);
    }

    const description = String(item.description ?? item.shortDescription ?? "").trim();
    const shortDescription = String(item.shortDescription ?? item.description ?? description).trim();

    return {
        id,
        name: String(item.name ?? item.title ?? "Ù…Ø­ØµÙˆÙ„ Ø¨Ø¯ÙˆÙ† Ù†Ø§Ù…").trim(),
        image: String(item.image ?? "").trim() || "img/product-placeholder.svg",
        brand: String(item.brand ?? "WEB 2").trim(),
        icon: normalizeIcon(item.icon ?? item.image),
        accent: normalizeAccent(item.accent),
        tag: String(item.tag ?? "Ù…Ø­ØµÙˆÙ„").trim(),
        price: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
        stock: Number.isFinite(stockRaw) && stockRaw >= 0 ? stockRaw : 50,
        rating: Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : 5,
        reviews: Number.isFinite(reviewsRaw) && reviewsRaw >= 0 ? reviewsRaw : 0,
        shortDescription,
        description,
        features,
        guarantee: String(item.guarantee ?? "Ú¯Ø§Ø±Ø§Ù†ØªÛŒ ÙØ±ÙˆØ´Ú¯Ø§Ù‡").trim(),
        category: String(item.category ?? "Ù…Ø­ØµÙˆÙ„").trim()
    };
}

function mergeProducts(...lists) {
    const merged = new Map();
    lists.flat().forEach((item) => {
        const normalized = normalizeProduct(item);
        if (normalized) merged.set(String(normalized.id), { ...(merged.get(String(normalized.id)) || {}), ...normalized });
    });
    return [...merged.values()];
}

// Ø§Ú¯Ø± Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ Ù‚Ø¨Ù„Ø§Ù‹ Ø¨Ø§ Ú©Ù„ÛŒØ¯ Ø¯ÛŒÚ¯Ø±ÛŒ Ø°Ø®ÛŒØ±Ù‡ Ø´Ø¯Ù‡ Ø¨ÙˆØ¯Ù†Ø¯ØŒ Ø¢Ù†â€ŒÙ‡Ø§ Ø±Ø§ Ù¾ÛŒØ¯Ø§ Ùˆ Ù…Ù†ØªÙ‚Ù„ Ù…ÛŒâ€ŒÚ©Ù†Ø¯ (Ø¨Ø¯ÙˆÙ† Ø­Ø°Ù Ú©Ù„ÛŒØ¯ Ù‚Ø¯ÛŒÙ…ÛŒ).
function migrateLegacyProducts() {
    for (const legacyKey of LEGACY_PRODUCT_KEYS) {
        try {
            const legacy = JSON.parse(localStorage.getItem(legacyKey));
            if (Array.isArray(legacy) && legacy.length) {
                console.log(`[getProducts] Ø¯Ø§Ø¯Ù‡ Ù‚Ø¯ÛŒÙ…ÛŒ Ø§Ø² Ú©Ù„ÛŒØ¯ Â«${legacyKey}Â» Ù…Ù†ØªÙ‚Ù„ Ø´Ø¯.`);
                return legacy.map(normalizeProduct).filter(Boolean);
            }
        } catch {
            continue;
        }
    }
    return [];
}

// Ø®ÙˆØ§Ù†Ø¯Ù† Ù…Ø­ØµÙˆÙ„Ø§Øª Ø§Ø² localStorageØ› Ø§Ú¯Ø± Ø®Ø§Ù„ÛŒ Ø¨ÙˆØ¯ Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ø§ÙˆÙ„ÛŒÙ‡ Ø±Ø§ Ù…ÛŒâ€ŒÚ©Ø§Ø±Ø¯.
function getProducts() {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(PRODUCTS_KEY));
    } catch {
        stored = null;
    }

    if (!Array.isArray(stored) || !stored.length) {
        const migrated = migrateLegacyProducts();
        const seeded = mergeProducts(migrated);
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(seeded));
        console.log(`[getProducts] ${migrated.length ? "Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ù…Ù†ØªÙ‚Ù„â€ŒØ´Ø¯Ù‡" : "Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ø§ÙˆÙ„ÛŒÙ‡ (seed)"} Ø°Ø®ÛŒØ±Ù‡ Ø´Ø¯Ù†Ø¯ â€” ØªØ¹Ø¯Ø§Ø¯: ${seeded.length}`);
        products = seeded;
        return seeded;
    }

    let normalized = mergeProducts(stored);

    // Ù…Ø­Ø§ÙØ¸Øª Ø¯Ø± Ø¨Ø±Ø§Ø¨Ø± Ø¯Ø§Ø¯Ù‡â€ŒÛŒ Ù…Ø¹ÛŒÙˆØ¨: Ø§Ú¯Ø± Ú©Ù„ÛŒØ¯ Ù¾Ø± Ø¨ÙˆØ¯ ÙˆÙ„ÛŒ Ù‡Ù…Ù‡â€ŒÛŒ Ø±Ú©ÙˆØ±Ø¯Ù‡Ø§ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø¨ÙˆØ¯Ù†Ø¯ØŒ
    // Ø¨Ù‡â€ŒØ¬Ø§ÛŒ Ù†Ù…Ø§ÛŒØ´ ÙØ±ÙˆØ´Ú¯Ø§Ù‡ Ø®Ø§Ù„ÛŒØŒ Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ø§ÙˆÙ„ÛŒÙ‡ Ø¨Ø§Ø²Ú¯Ø±Ø¯Ø§Ù†Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯ (Ú©Ù„ÛŒØ¯ Ù‚Ø¯ÛŒÙ…ÛŒ Ø­Ø°Ù Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯).
    if (!normalized.length) {
        normalized = [];
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
        console.warn("[getProducts] Ø¯Ø§Ø¯Ù‡â€ŒÛŒ Ø°Ø®ÛŒØ±Ù‡â€ŒØ´Ø¯Ù‡ Ù…Ø¹ÛŒÙˆØ¨ Ø¨ÙˆØ¯Ø› Ø¯Ø§Ø¯Ù‡â€ŒÙ‡Ø§ÛŒ Ø§ÙˆÙ„ÛŒÙ‡ (seed) Ø¨Ø§Ø²Ú¯Ø±Ø¯Ø§Ù†Ø¯Ù‡ Ø´Ø¯Ù†Ø¯.", { storedCount: stored.length });
        products = normalized;
        return normalized;
    }

    if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
        console.log("[getProducts] Ø³Ø§Ø®ØªØ§Ø± Ù…Ø­ØµÙˆÙ„Ø§Øª Ù‚Ø¯ÛŒÙ…ÛŒ Ø¨Ù‡â€ŒØ±ÙˆØ² Ùˆ ÛŒÚ©Ù†ÙˆØ§Ø®Øª Ø´Ø¯ (migration).");
    }
    console.log(`[getProducts] Ø§Ø² localStorage Ø®ÙˆØ§Ù†Ø¯Ù‡ Ø´Ø¯ â€” ØªØ¹Ø¯Ø§Ø¯: ${normalized.length}`);
    products = normalized;
    return normalized;
}

function saveProducts(list) {
    const normalized = (Array.isArray(list) ? list : products).map(normalizeProduct).filter(Boolean);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(normalized));
    products = normalized;
    console.log(`[saveProducts] Ø¯Ø± localStorage Ø°Ø®ÛŒØ±Ù‡ Ø´Ø¯ â€” ØªØ¹Ø¯Ø§Ø¯: ${normalized.length}`);
    return normalized;
}

async function loadProductsFromApi() {
    try {
        const response = await fetch(PRODUCT_API_BASE, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const apiProducts = Array.isArray(payload) ? payload : payload.products;
        if (!Array.isArray(apiProducts)) throw new Error("Invalid products payload");
        const merged = mergeProducts(apiProducts);
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(merged));
        localStorage.setItem(PRODUCT_FALLBACK_KEY, JSON.stringify(merged));
        products = merged;
        console.log(`[products] API ???? ï¿½ ??????: ${apiProducts.length}? ?????: ${merged.length}`);
        return merged;
    } catch (error) {
        console.error("[products] ???? API:", error);
        let fallback = [];
        try { fallback = JSON.parse(localStorage.getItem(PRODUCT_FALLBACK_KEY) || "[]"); } catch {}
        products = mergeProducts(fallback);
        console.warn(`[products] ??????? ???? ï¿½ ?????: ${products.length}`);
        return products;
    }
}

function createProduct(productData) {
    const name = String(productData?.name ?? "").trim();
    const description = String(productData?.description ?? "").trim();
    const price = Number(productData?.price);

    if (name.length < 2) throw new Error("Ù†Ø§Ù… Ù…Ø­ØµÙˆÙ„ Ø¨Ø§ÛŒØ¯ Ø­Ø¯Ø§Ù‚Ù„ Û² Ú©Ø§Ø±Ø§Ú©ØªØ± Ø¨Ø§Ø´Ø¯.");
    if (description.length < 5) throw new Error("ØªÙˆØ¶ÛŒØ­Ø§Øª Ù…Ø­ØµÙˆÙ„ Ø¨Ø§ÛŒØ¯ Ø­Ø¯Ø§Ù‚Ù„ Ûµ Ú©Ø§Ø±Ø§Ú©ØªØ± Ø¨Ø§Ø´Ø¯.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("Ù‚ÛŒÙ…Øª Ù…Ø­ØµÙˆÙ„ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª.");

    const nextId = products.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
    const newProduct = normalizeProduct({
        id: nextId,
        name,
        brand: "WEB 2 CUSTOM",
        icon: productData.icon,
        accent: "#00d4ff",
        tag: "Ø¬Ø¯ÛŒØ¯",
        price: Math.round(price),
        stock: 50,
        rating: 5,
        reviews: 0,
        shortDescription: description,
        description,
        features: ["Ù…Ø­ØµÙˆÙ„ Ø§ÙØ²ÙˆØ¯Ù‡â€ŒØ´Ø¯Ù‡ ØªÙˆØ³Ø· Ù…Ø¯ÛŒØ±ÛŒØª", "Ù…ÙˆØ¬ÙˆØ¯ Ùˆ Ø¢Ù…Ø§Ø¯Ù‡ Ø³ÙØ§Ø±Ø´"],
        guarantee: "Ø¶Ù…Ø§Ù†Øª ÙØ±ÙˆØ´Ú¯Ø§Ù‡",
        category: "Ù…Ø­ØµÙˆÙ„ Ø³ÙØ§Ø±Ø´ÛŒ"
    });

    products.push(newProduct);
    saveProducts(products);
    return newProduct;
}

function deleteProduct(productId) {
    const numericId = Number(productId);
    const product = getProduct(numericId);
    if (!product) return false;

    products = products.filter((item) => Number(item.id) !== numericId);
    saveProducts(products);
    saveCart(getCart().filter((item) => item.id !== numericId));
    return true;
}

function saveContactMessage(messageData) {
    let messages = [];
    try {
        messages = JSON.parse(localStorage.getItem(MESSAGES_KEY)) || [];
        if (!Array.isArray(messages)) messages = [];
    } catch {
        messages = [];
    }

    const nextId = messages.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
    const message = {
        id: nextId,
        name: String(messageData?.name ?? "").trim(),
        email: String(messageData?.email ?? "").trim(),
        subject: String(messageData?.subject ?? "").trim(),
        message: String(messageData?.message ?? "").trim(),
        createdAt: new Date().toISOString()
    };

    messages.unshift(message);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    return message;
}

function getContactMessages() {
    try {
        const messages = JSON.parse(localStorage.getItem(MESSAGES_KEY));
        return Array.isArray(messages) ? messages : [];
    } catch {
        return [];
    }
}

function formatNumber(value) {
    return numberFormatter.format(Number(value) || 0);
}

function formatPrice(value) {
    return `${formatNumber(value)} ØªÙˆÙ…Ø§Ù†`;
}

function getProduct(productId) {
    return products.find((product) => Number(product.id) === Number(productId));
}

function normalizeCart(cart) {
    if (!Array.isArray(cart)) return [];

    return cart.reduce((items, item) => {
        const product = getProduct(item && item.id);
        if (!product) return items;

        const stock = Math.max(0, Number(product.stock) || 0);
        if (stock < 1) return items;

        const productId = Number(product.id);
        const quantity = Math.max(1, Math.min(stock, Number(item.quantity) || 1));
        const existing = items.find((entry) => entry.id === productId);

        if (existing) {
            existing.quantity = Math.min(stock, existing.quantity + quantity);
        } else {
            items.push({ id: productId, quantity });
        }
        return items;
    }, []);
}

function getCart() {
    try {
        const storedCart = localStorage.getItem(CART_KEY);
        const legacyCart = localStorage.getItem("cart");
        const cart = normalizeCart(JSON.parse(storedCart || legacyCart || "[]"));

        if (!storedCart && legacyCart) {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        }
        return cart;
    } catch {
        return [];
    }
}

function saveCart(cart) {
    const normalizedCart = normalizeCart(cart);
    localStorage.setItem(CART_KEY, JSON.stringify(normalizedCart));
    updateCartCount();
    return normalizedCart;
}

function getCartTotals(cart = getCart()) {
    const totals = cart.reduce((result, item) => {
        const product = getProduct(item.id);
        if (!product) return result;
        result.quantity += item.quantity;
        result.subtotal += product.price * item.quantity;
        return result;
    }, { quantity: 0, subtotal: 0 });
    const hasDiscount = localStorage.getItem(DISCOUNT_KEY) === DISCOUNT_CODE;
    const discount = hasDiscount ? Math.round(totals.subtotal * DISCOUNT_RATE) : 0;
    return {
        ...totals,
        price: totals.subtotal - discount,
        discount,
        hasDiscount
    };
}

function getProductBadge(product) {
    if (Number(product.reviews) >= 180) return "Ù¾Ø±ÙØ±ÙˆØ´";
    if (Number(product.id) >= 8 || String(product.tag).includes("Ø¬Ø¯ÛŒØ¯")) return "Ø¬Ø¯ÛŒØ¯";
    if (Number(product.price) >= 6000000) return "ØªØ®ÙÛŒÙ";
    return product.tag;
}

function createProductCard(product, compact = false) {
    const accent = normalizeAccent(product.accent);
    return `
        <article class="product-card${compact ? " product-card-compact" : ""}" style="--accent:${accent};--accent-soft:${accent}18;--accent-soft-strong:${accent}66">
            <a class="product-card-link" href="product.html?id=${product.id}" aria-label="Ù…Ø´Ø§Ù‡Ø¯Ù‡ Ù…Ø´Ø®ØµØ§Øª ${escapeHTML(product.name)}">
                <div class="product-art">
                    <span class="product-tag">${escapeHTML(getProductBadge(product))}</span>
                    <i class="fa-solid ${normalizeIcon(product.icon)}" aria-hidden="true"></i>
                </div>
                <div class="product-body">
                    <span class="product-brand">${escapeHTML(product.brand)}</span>
                    <h3>${escapeHTML(product.name)}</h3>
                    <p class="product-description">${escapeHTML(product.shortDescription)}</p>
                    <div class="product-rating" aria-label="Ø§Ù…ØªÛŒØ§Ø² ${product.rating} Ø§Ø² Ûµ">
                        <i class="fa-solid fa-star" aria-hidden="true"></i>
                        <strong>${product.rating}</strong>
                        <span>(${formatNumber(product.reviews)} Ù†Ø¸Ø±)</span>
                    </div>
                    <div class="product-footer">
                        <span class="product-price"><span>Ù‚ÛŒÙ…Øª</span><strong>${formatPrice(product.price)}</strong></span>
                        <span class="view-product">Ù…Ø´Ø§Ù‡Ø¯Ù‡ Ù…Ø´Ø®ØµØ§Øª <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></span>
                    </div>
                </div>
            </a>
        </article>`;
}

function renderHomeDiscovery() {
    const categoryGrid = document.getElementById("categoryGrid");
    const categoryFilter = document.getElementById("categoryFilter");
    const featuredGrid = document.getElementById("featuredGrid");
    if (!categoryGrid && !categoryFilter && !featuredGrid) return;

    const categoryMap = new Map();
    products.forEach((product) => {
        if (!categoryMap.has(product.category)) {
            categoryMap.set(product.category, { icon: product.icon, count: 0, accent: product.accent });
        }
        categoryMap.get(product.category).count += 1;
    });

    if (categoryGrid) {
        categoryGrid.innerHTML = [...categoryMap.entries()].slice(0, 8).map(([category, meta]) => `
            <button class="category-card" type="button" data-category-select="${escapeHTML(category)}" style="--category-accent:${normalizeAccent(meta.accent)}">
                <span><i class="fa-solid ${normalizeIcon(meta.icon)}"></i></span>
                <strong>${escapeHTML(category)}</strong>
                <small>${formatNumber(meta.count)} Ù…Ø­ØµÙˆÙ„</small>
            </button>`).join("");
    }

    if (categoryFilter) {
        const currentValue = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">Ù‡Ù…Ù‡ Ø¯Ø³ØªÙ‡â€ŒÙ‡Ø§</option>' +
            [...categoryMap.keys()].map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
        categoryFilter.value = [...categoryMap.keys()].includes(currentValue) ? currentValue : "all";
    }

    if (featuredGrid) {
        const featured = [...products]
            .sort((a, b) => (b.reviews + b.rating * 40) - (a.reviews + a.rating * 40))
            .slice(0, 4);
        featuredGrid.innerHTML = featured.map((product) => createProductCard(product, true)).join("");
    }
}

function getFilteredProducts() {
    const query = document.getElementById("productSearch")?.value.trim().toLocaleLowerCase("fa") || "";
    const category = document.getElementById("categoryFilter")?.value || "all";
    const priceRange = document.getElementById("priceFilter")?.value || "all";
    const sort = document.getElementById("productSort")?.value || "popular";

    const filtered = products.filter((product) => {
        const searchable = `${product.name} ${product.brand} ${product.category} ${product.shortDescription}`.toLocaleLowerCase("fa");
        const matchesQuery = !query || searchable.includes(query);
        const matchesCategory = category === "all" || product.category === category;
        const matchesPrice = priceRange === "all" ||
            (priceRange === "under-3" && product.price < 3000000) ||
            (priceRange === "3-6" && product.price >= 3000000 && product.price <= 6000000) ||
            (priceRange === "over-6" && product.price > 6000000);
        return matchesQuery && matchesCategory && matchesPrice;
    });

    return filtered.sort((a, b) => {
        if (sort === "price-asc") return a.price - b.price;
        if (sort === "price-desc") return b.price - a.price;
        if (sort === "rating") return b.rating - a.rating;
        return (b.reviews + b.rating * 40) - (a.reviews + a.rating * 40);
    });
}

function updateCartCount() {
    const { quantity } = getCartTotals();
    document.querySelectorAll("#cart-count").forEach((counter) => {
        counter.textContent = formatNumber(quantity);
        counter.setAttribute("aria-label", `${formatNumber(quantity)} Ú©Ø§Ù„Ø§ Ø¯Ø± Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯`);
        counter.classList.remove("cart-count-updated");
        void counter.offsetWidth;
        counter.classList.add("cart-count-updated");
    });
}

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "status");
    const icon = document.createElement("i");
    const text = document.createElement("span");
    icon.className = `fa-solid ${type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}`;
    icon.setAttribute("aria-hidden", "true");
    text.textContent = String(message);
    toast.append(icon, text);
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("removing");
        window.setTimeout(() => toast.remove(), 250);
    }, 3000);
}

function addToCart(productId) {
    if (!getCurrentUser()) {
        openAuthModal("Ø´Ù…Ø§ Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ Ù†Ø¯Ø§Ø±ÛŒØ¯! Ø¨Ø±Ø§ÛŒ Ø®Ø±ÛŒØ¯ Ø§Ø¨ØªØ¯Ø§ Ø¨Ø§ÛŒØ¯ ÙˆØ§Ø±Ø¯ Ø´ÙˆÛŒØ¯.");
        return;
    }
    const product = getProduct(productId);
    if (!product) {
        showToast("Ù…Ø­ØµÙˆÙ„ Ù…ÙˆØ±Ø¯Ù†Ø¸Ø± Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯.", "error");
        return;
    }
    if (Number(product.stock) < 1) {
        showToast("Ø§ÛŒÙ† Ù…Ø­ØµÙˆÙ„ Ø¯Ø± Ø­Ø§Ù„ Ø­Ø§Ø¶Ø± Ù…ÙˆØ¬ÙˆØ¯ Ù†ÛŒØ³Øª.", "error");
        return;
    }

    const cart = getCart();
    const cartItem = cart.find((item) => item.id === product.id);

    if (cartItem) {
        if (cartItem.quantity >= product.stock) {
            showToast("Ø¨ÛŒØ´ØªØ± Ø§Ø² Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù…Ø­ØµÙˆÙ„ Ù†Ù…ÛŒâ€ŒØªÙˆØ§Ù† Ø§Ø¶Ø§ÙÙ‡ Ú©Ø±Ø¯.", "error");
            return;
        }
        cartItem.quantity += 1;
    } else {
        cart.push({ id: product.id, quantity: 1 });
    }

    saveCart(cart);
    showToast(`${product.name} Ø¨Ù‡ Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯.`);

    const button = document.querySelector(`[data-add-to-cart="${product.id}"]`);
    if (button) {
        const originalContent = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check"></i> Ø¨Ù‡ Ø³Ø¨Ø¯ Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯';
        window.setTimeout(() => {
            button.innerHTML = originalContent;
        }, 1400);
    }
}

function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(USER_SESSION_KEY) || "null"); } catch { return null; }
}

function saveCurrentUser(user) {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
    updateAuthUI();
}

function setupAuthUI() {
    const navActions = document.querySelector(".nav-actions");
    if (!navActions || document.getElementById("authTrigger")) return;
    const trigger = document.createElement("a");
    trigger.id = "authTrigger";
    trigger.type = "button";
    trigger.className = "profile-button user-account-btn";
    trigger.href = "profile.html";
    trigger.target = "_blank";
    trigger.rel = "noopener";
    navActions.prepend(trigger);

    const modal = document.createElement("div");
    modal.id = "authModal";
    modal.className = "auth-modal";
    modal.hidden = true;
    modal.innerHTML = `<div class="auth-backdrop" data-close-auth></div><section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" type="button" data-close-auth aria-label="Ø¨Ø³ØªÙ†"><i class="fa-solid fa-xmark"></i></button>
      <div class="auth-brand"><i class="fa-solid fa-gamepad"></i><span>GAME PIXEL</span></div>
      <h2 id="authTitle">ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ</h2><p class="auth-hint">Ø¨Ø±Ø§ÛŒ ØªØ¬Ø±Ø¨Ù‡â€ŒØ§ÛŒ Ø´Ø®ØµÛŒâ€ŒØªØ± Ø¯Ø± ÙØ±ÙˆØ´Ú¯Ø§Ù‡</p>
      <form id="authForm"><label>Ù†Ø§Ù… Ú¯ÛŒÙ…Ø±ÛŒ / Ù†Ø§Ù… Ú©Ø§Ø±Ø¨Ø±<input name="name" required minlength="2" autocomplete="name" placeholder="Ù…Ø«Ù„Ø§Ù‹ Ø¢Ø±Ø´ Ú¯ÛŒÙ…Ø±"></label><label>Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³ ÛŒØ§ Ø§ÛŒÙ…ÛŒÙ„<input name="phone" required autocomplete="email tel" placeholder="Û°Û¹Û±Û²Û±Û²Û³Û´ÛµÛ¶Û· ÛŒØ§ you@example.com"></label><button class="primary-button" type="submit">ÙˆØ±ÙˆØ¯ / Ø³Ø§Ø®Øª Ø­Ø³Ø§Ø¨ <i class="fa-solid fa-arrow-left"></i></button></form>
      <div id="profileView" hidden></div>
    </section>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target.closest("[data-close-auth]")) closeAuthModal(); });
    document.getElementById("authForm").addEventListener("submit", e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        saveCurrentUser({ name: data.get("name").trim(), phone: data.get("phone").trim(), orderCount: 0, joinDate: new Date().toISOString() });
        closeAuthModal(); showToast("Ø®ÙˆØ´ Ø¢Ù…Ø¯ÛŒØ¯! Ø­Ø³Ø§Ø¨ Ø´Ù…Ø§ Ø¢Ù…Ø§Ø¯Ù‡ Ø§Ø³Øª.");
    });
    updateAuthUI();
}

function updateAuthUI() {
    const trigger = document.getElementById("authTrigger");
    if (!trigger) return;
    const user = getCurrentUser();
    trigger.innerHTML = user ? `<i class="fa-solid fa-user-astronaut"></i><span>Ø®ÙˆØ´ Ø¢Ù…Ø¯ÛŒ ${escapeHTML(user.name.split(" ")[0])}</span>` : `<i class="fa-regular fa-circle-user"></i><span>Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ</span>`;
    trigger.classList.toggle("is-authenticated", !!user);
}

function openAuthModal(message = "") {
    const modal = document.getElementById("authModal"); if (!modal) return;
    modal.hidden = false; document.body.classList.add("auth-open");
    document.getElementById("authTitle").textContent = "ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ";
    document.getElementById("authForm").hidden = false; document.getElementById("profileView").hidden = true;
    let action = document.querySelector(".auth-card .auth-hint + .auth-open-profile");
    if (!action) { action = document.createElement("a"); action.className = "auth-open-profile primary-button"; action.target="_blank"; action.rel="noopener"; action.href="profile.html"; action.textContent="Ø¨Ø§Ø² Ú©Ø±Ø¯Ù† ØµÙØ­Ù‡ Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ"; document.querySelector(".auth-card").appendChild(action); }
    action.hidden = !message;
    document.querySelector(".auth-hint").textContent = message || "Ø¨Ø±Ø§ÛŒ ØªØ¬Ø±Ø¨Ù‡â€ŒØ§ÛŒ Ø´Ø®ØµÛŒâ€ŒØªØ± Ø¯Ø± ÙØ±ÙˆØ´Ú¯Ø§Ù‡";
}
function openProfileModal() {
    const modal = document.getElementById("authModal"), user = getCurrentUser(); if (!modal || !user) return;
    modal.hidden = false; document.body.classList.add("auth-open");
    document.getElementById("authTitle").textContent = "Ù¾Ø±ÙˆÙØ§ÛŒÙ„ Ú¯ÛŒÙ…Ø±";
    document.getElementById("authForm").hidden = true;
    const view = document.getElementById("profileView"); view.hidden = false;
    view.innerHTML = `<div class="profile-avatar"><i class="fa-solid fa-user-astronaut"></i></div><h3>${escapeHTML(user.name)}</h3><p>${escapeHTML(user.phone || "")}</p><span class="profile-level">Ø®Ø±ÛŒØ¯Ù‡Ø§: ${formatNumber(user.orderCount || 0)}</span><button class="secondary-button" id="logoutBtn" type="button">Ø®Ø±ÙˆØ¬</button>`;
    document.getElementById("logoutBtn").onclick = () => { localStorage.removeItem(USER_SESSION_KEY); closeAuthModal(); updateAuthUI(); showToast("Ø§Ø² Ø­Ø³Ø§Ø¨ Ø®Ø§Ø±Ø¬ Ø´Ø¯ÛŒØ¯."); };
}
function closeAuthModal() { const modal = document.getElementById("authModal"); if (modal) { modal.hidden = true; document.body.classList.remove("auth-open"); } }

function renderProducts() {
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    console.log(`[renderProducts] Ø±Ù†Ø¯Ø± ØµÙØ­Ù‡ Ø§ØµÙ„ÛŒ â€” ØªØ¹Ø¯Ø§Ø¯: ${products.length}`);
    const productCount = document.getElementById("homeProductCount");
    if (productCount) productCount.textContent = formatNumber(products.length);

    if (!products.length) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-icon"><i class="fa-solid fa-box-open"></i></div>
                <h2>Ù‡Ù†ÙˆØ² Ù…Ø­ØµÙˆÙ„ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª</h2>
                <p>Ù…Ø­ØµÙˆÙ„Ø§Øª Ø¬Ø¯ÛŒØ¯ Ù¾Ø³ Ø§Ø² Ø«Ø¨Øª Ø¯Ø± Ù¾Ù†Ù„ Ù…Ø¯ÛŒØ±ÛŒØª Ø§ÛŒÙ†Ø¬Ø§ Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.</p>
            </div>`;
        return;
    }

    const visibleProducts = getFilteredProducts();
    const resultsCount = document.getElementById("productResultsCount");
    if (resultsCount) resultsCount.textContent = `${formatNumber(visibleProducts.length)} Ù…Ø­ØµÙˆÙ„ Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯`;
    const clearButton = document.getElementById("clearProductFilters");
    if (clearButton) clearButton.hidden = visibleProducts.length === products.length;

    grid.innerHTML = visibleProducts.length
        ? visibleProducts.map((product) => createProductCard(product)).join("")
        : `<div class="empty-state products-empty">
            <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
            <h2>Ù…Ø­ØµÙˆÙ„ÛŒ Ø¨Ø§ Ø§ÛŒÙ† ÙÛŒÙ„ØªØ± Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯</h2>
            <p>Ø¹Ø¨Ø§Ø±Øª Ø¬Ø³ØªØ¬Ùˆ ÛŒØ§ Ù…Ø­Ø¯ÙˆØ¯Ù‡ ÙÛŒÙ„ØªØ±Ù‡Ø§ Ø±Ø§ ØªØºÛŒÛŒØ± Ø¯Ù‡ÛŒØ¯.</p>
        </div>`;
}

function renderProductDetail() {
    const container = document.getElementById("productDetail");
    if (!container) return;

    const productId = new URLSearchParams(window.location.search).get("id");
    const product = getProduct(productId);

    if (!product) {
        container.setAttribute("aria-busy", "false");
        document.title = "Ù…Ø­ØµÙˆÙ„ Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯ | Web 2";
        container.innerHTML = `
            <div class="not-found-state">
                <i class="fa-solid fa-ghost" aria-hidden="true"></i>
                <h1>Ø§ÛŒÙ† Ù…Ø­ØµÙˆÙ„ Ø¯Ø± Ø¯Ø³ØªØ±Ø³ Ù†ÛŒØ³Øª</h1>
                <p>Ø´Ù†Ø§Ø³Ù‡ Ù…Ø­ØµÙˆÙ„ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª ÛŒØ§ Ù…Ø­ØµÙˆÙ„ Ù…ÙˆØ±Ø¯Ù†Ø¸Ø± Ø§Ø² ÙÙ‡Ø±Ø³Øª Ø®Ø§Ø±Ø¬ Ø´Ø¯Ù‡ Ø§Ø³Øª.</p>
                <a class="primary-button" href="index.html#products">Ø¨Ø§Ø²Ú¯Ø´Øª Ø¨Ù‡ Ù…Ø­ØµÙˆÙ„Ø§Øª <i class="fa-solid fa-arrow-left"></i></a>
            </div>`;
        return;
    }

    document.title = `${product.name} | Web 2`;
    container.setAttribute("aria-busy", "false");
    const breadcrumb = document.getElementById("breadcrumbProduct");
    if (breadcrumb) breadcrumb.textContent = product.name;
    const accent = normalizeAccent(product.accent);
    const inStock = Number(product.stock) > 0;

    container.innerHTML = `
        <div class="product-detail-grid" style="--accent:${accent};--accent-soft:${accent}18;--accent-soft-strong:${accent}66">
            <div class="detail-visual">
                <i class="fa-solid ${normalizeIcon(product.icon)}" aria-hidden="true"></i>
                <span class="detail-stock-badge ${inStock ? "" : "out-of-stock"}"><i class="fa-solid ${inStock ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${inStock ? `${formatNumber(product.stock)} Ø¹Ø¯Ø¯ Ù…ÙˆØ¬ÙˆØ¯` : "Ù†Ø§Ù…ÙˆØ¬ÙˆØ¯"}</span>
            </div>
            <div class="detail-info">
                <span class="detail-brand">${escapeHTML(product.brand)} / ${escapeHTML(product.category)}</span>
                <h1>${escapeHTML(product.name)}</h1>
                <div class="detail-rating">
                    <i class="fa-solid fa-star"></i>
                    <strong>${product.rating}</strong>
                    <span>Ø§Ø² Ûµ â€” ${formatNumber(product.reviews)} Ø¯ÛŒØ¯Ú¯Ø§Ù‡</span>
                </div>
                <p class="detail-intro">${escapeHTML(product.description)}</p>
                <ul class="detail-features">
                    ${(Array.isArray(product.features) ? product.features : []).map((feature) => `<li><i class="fa-solid fa-check"></i><span>${escapeHTML(feature)}</span></li>`).join("")}
                </ul>
                <div class="detail-meta">
                    <span><i class="fa-solid fa-shield-halved"></i> ${escapeHTML(product.guarantee)}</span>
                    <span><i class="fa-solid fa-truck-fast"></i> Ø§Ø±Ø³Ø§Ù„ Ù†Ù…Ø§ÛŒØ´ÛŒ Ø±Ø§ÛŒÚ¯Ø§Ù†</span>
                    <span><i class="fa-solid fa-box-open"></i> Ø¨Ø³ØªÙ‡â€ŒØ¨Ù†Ø¯ÛŒ Ø§ÛŒÙ…Ù†</span>
                </div>
                <div class="detail-purchase">
                    <span class="detail-price"><span>Ù‚ÛŒÙ…Øª Ù…Ø­ØµÙˆÙ„</span><strong>${formatPrice(product.price)}</strong></span>
                    <span class="detail-stock-badge ${inStock ? "" : "out-of-stock"}"><i class="fa-solid ${inStock ? "fa-bolt" : "fa-ban"}"></i> ${inStock ? "Ø¢Ù…Ø§Ø¯Ù‡ Ø§Ø±Ø³Ø§Ù„ Ù†Ù…Ø§ÛŒØ´ÛŒ" : "ÙØ¹Ù„Ø§Ù‹ Ù‚Ø§Ø¨Ù„ Ø³ÙØ§Ø±Ø´ Ù†ÛŒØ³Øª"}</span>
                </div>
                <div class="detail-buttons">
                    <button class="primary-button" type="button" data-add-to-cart="${product.id}" ${inStock ? "" : "disabled"}><i class="fa-solid ${inStock ? "fa-cart-plus" : "fa-ban"}"></i> ${inStock ? "Ø§ÙØ²ÙˆØ¯Ù† Ø¨Ù‡ Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯" : "Ù†Ø§Ù…ÙˆØ¬ÙˆØ¯"}</button>
                    <a class="secondary-button" href="index.html#products"><i class="fa-solid fa-arrow-right"></i> Ø¨Ø§Ø²Ú¯Ø´Øª Ø¨Ù‡ Ù…Ø­ØµÙˆÙ„Ø§Øª</a>
                </div>
            </div>
        </div>`;
}

function changeCartQuantity(productId, change) {
    const product = getProduct(productId);
    const cart = getCart();
    const cartItem = cart.find((item) => item.id === Number(productId));
    if (!product || !cartItem) return;

    const nextQuantity = cartItem.quantity + change;
    if (nextQuantity > product.stock) {
        showToast("ØªØ¹Ø¯Ø§Ø¯ Ø§Ù†ØªØ®Ø§Ø¨â€ŒØ´Ø¯Ù‡ Ø§Ø² Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ø¨ÛŒØ´ØªØ± Ø§Ø³Øª.", "error");
        return;
    }

    if (nextQuantity < 1) {
        removeCartItem(productId);
        return;
    }

    cartItem.quantity = nextQuantity;
    saveCart(cart);
    renderCart();
}

function removeCartItem(productId) {
    const product = getProduct(productId);
    const cart = getCart().filter((item) => item.id !== Number(productId));
    saveCart(cart);
    renderCart();
    if (product) showToast(`${product.name} Ø§Ø² Ø³Ø¨Ø¯ Ø­Ø°Ù Ø´Ø¯.`);
}

function renderCart() {
    const cartItems = document.getElementById("cartItems");
    if (!cartItems) return;

    const emptyState = document.getElementById("emptyCart");
    const summary = document.getElementById("cartSummary");
    const cart = getCart();

    if (!cart.length) {
        cartItems.innerHTML = "";
        cartItems.setAttribute("aria-busy", "false");
        emptyState.hidden = false;
        summary.hidden = true;
        return;
    }

    emptyState.hidden = true;
    summary.hidden = false;
    cartItems.innerHTML = cart.map((item) => {
        const product = getProduct(item.id);
        const accent = normalizeAccent(product.accent);
        return `
            <article class="cart-item" style="--accent:${accent};--accent-soft:${accent}18;--accent-soft-strong:${accent}66">
                <a class="cart-item-art" href="product.html?id=${product.id}" aria-label="Ù…Ø´Ø§Ù‡Ø¯Ù‡ ${escapeHTML(product.name)}">
                    <i class="fa-solid ${normalizeIcon(product.icon)}" aria-hidden="true"></i>
                </a>
                <div class="cart-item-info">
                    <span class="cart-item-brand">${escapeHTML(product.brand)}</span>
                    <h2><a href="product.html?id=${product.id}">${escapeHTML(product.name)}</a></h2>
                    <strong>${formatPrice(product.price * item.quantity)}</strong>
                </div>
                <div class="cart-item-actions">
                    <div class="quantity-control" aria-label="ØªØ¹Ø¯Ø§Ø¯ ${escapeHTML(product.name)}">
                        <button class="quantity-button" type="button" data-cart-action="increase" data-product-id="${product.id}" aria-label="Ø§ÙØ²Ø§ÛŒØ´ ØªØ¹Ø¯Ø§Ø¯"><i class="fa-solid fa-plus"></i></button>
                        <span class="quantity-value">${formatNumber(item.quantity)}</span>
                        <button class="quantity-button" type="button" data-cart-action="decrease" data-product-id="${product.id}" aria-label="Ú©Ø§Ù‡Ø´ ØªØ¹Ø¯Ø§Ø¯"><i class="fa-solid fa-minus"></i></button>
                    </div>
                    <button class="remove-button" type="button" data-cart-action="remove" data-product-id="${product.id}" aria-label="Ø­Ø°Ù ${escapeHTML(product.name)}"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </article>`;
    }).join("");
    cartItems.setAttribute("aria-busy", "false");

    const totals = getCartTotals(cart);
    document.getElementById("totalItems").textContent = formatNumber(totals.quantity);
    document.getElementById("subtotalPrice").textContent = formatPrice(totals.subtotal);
    document.getElementById("discountLine").hidden = !totals.hasDiscount;
    document.getElementById("discountAmount").textContent = `âˆ’ ${formatPrice(totals.discount)}`;
    document.getElementById("totalPrice").textContent = formatPrice(totals.price);
}

function renderCheckout() {
    const itemsContainer = document.getElementById("checkoutItems");
    if (!itemsContainer) return;

    const checkoutContent = document.getElementById("checkoutContent");
    const cart = getCart();

    if (!cart.length) {
        itemsContainer.setAttribute("aria-busy", "false");
        checkoutContent.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-icon"><i class="fa-solid fa-basket-shopping"></i></div>
                <h2>Ù…Ø­ØµÙˆÙ„ÛŒ Ø¨Ø±Ø§ÛŒ Ù¾Ø±Ø¯Ø§Ø®Øª ÙˆØ¬ÙˆØ¯ Ù†Ø¯Ø§Ø±Ø¯</h2>
                <p>Ø§Ø¨ØªØ¯Ø§ ÛŒÚ© Ù…Ø­ØµÙˆÙ„ Ø¨Ù‡ Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø§Ø¶Ø§ÙÙ‡ Ú©Ù†ÛŒØ¯.</p>
                <a class="primary-button" href="index.html#products">Ø±ÙØªÙ† Ø¨Ù‡ ÙØ±ÙˆØ´Ú¯Ø§Ù‡ <i class="fa-solid fa-arrow-left"></i></a>
            </div>`;
        return;
    }

    itemsContainer.innerHTML = cart.map((item) => {
        const product = getProduct(item.id);
        const accent = normalizeAccent(product.accent);
        return `
            <div class="checkout-item" style="--accent:${accent};--accent-soft:${accent}18">
                <span class="checkout-item-icon"><i class="fa-solid ${normalizeIcon(product.icon)}"></i></span>
                <span class="checkout-item-info"><strong>${escapeHTML(product.name)}</strong><span>${formatNumber(item.quantity)} Ø¹Ø¯Ø¯</span></span>
                <strong>${formatPrice(product.price * item.quantity)}</strong>
            </div>`;
    }).join("");
    itemsContainer.setAttribute("aria-busy", "false");

    const totals = getCartTotals(cart);
    document.getElementById("checkoutItemCount").textContent = formatNumber(totals.quantity);
    document.getElementById("checkoutDiscountLine").hidden = !totals.hasDiscount;
    document.getElementById("checkoutDiscount").textContent = `âˆ’ ${formatPrice(totals.discount)}`;
    document.getElementById("checkoutTotal").textContent = formatPrice(totals.price);
    document.getElementById("paymentAmount").textContent = formatPrice(totals.price);
}

function setupProductControls() {
    const controls = ["productSearch", "categoryFilter", "priceFilter", "productSort"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    controls.forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", renderProducts));

    document.getElementById("clearProductFilters")?.addEventListener("click", () => {
        document.getElementById("productSearch").value = "";
        document.getElementById("categoryFilter").value = "all";
        document.getElementById("priceFilter").value = "all";
        document.getElementById("productSort").value = "popular";
        renderProducts();
    });

    document.getElementById("categoryGrid")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category-select]");
        if (!button) return;
        document.getElementById("categoryFilter").value = button.dataset.categorySelect;
        renderProducts();
        document.getElementById("products").scrollIntoView({ behavior: "smooth" });
    });
}

function setupDiscountForm() {
    const form = document.getElementById("discountForm");
    if (!form) return;
    const input = document.getElementById("discountCode");
    const hint = document.getElementById("discountHint");
    if (localStorage.getItem(DISCOUNT_KEY) === DISCOUNT_CODE) {
        input.value = DISCOUNT_CODE;
        hint.textContent = "ØªØ®ÙÛŒÙ Û±Û°Ùª ÙØ¹Ø§Ù„ Ø§Ø³Øª.";
        hint.classList.add("success");
    }
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (input.value.trim().toUpperCase() !== DISCOUNT_CODE) {
            hint.textContent = "Ú©Ø¯ ÙˆØ§Ø±Ø¯Ø´Ø¯Ù‡ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª.";
            hint.classList.remove("success");
            showToast("Ú©Ø¯ ØªØ®ÙÛŒÙ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª.", "error");
            return;
        }
        localStorage.setItem(DISCOUNT_KEY, DISCOUNT_CODE);
        hint.textContent = "ØªØ®ÙÛŒÙ Û±Û°Ùª Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø§Ø¹Ù…Ø§Ù„ Ø´Ø¯.";
        hint.classList.add("success");
        renderCart();
        showToast("Ú©Ø¯ ØªØ®ÙÛŒÙ WEB2 Ø§Ø¹Ù…Ø§Ù„ Ø´Ø¯.");
    });
}

function setupBackToTop() {
    const button = document.getElementById("backToTop");
    if (!button) return;
    const updateVisibility = () => button.classList.toggle("visible", window.scrollY > 500);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    updateVisibility();
}

function setFieldValidity(field, isValid) {
    if (!field) return isValid;
    field.classList.toggle("input-error", !isValid);
    field.setAttribute("aria-invalid", String(!isValid));
    return isValid;
}

function validateCheckoutForm() {
    const name = document.getElementById("customerName");
    const phone = document.getElementById("customerPhone");
    const address = document.getElementById("customerAddress");
    const card = document.getElementById("cardNumber");
    const expiry = document.getElementById("expiryDate");
    const cvv = document.getElementById("cvv");

    const cardDigits = card.value.replace(/\D/g, "");
    const phoneDigits = phone.value.replace(/\D/g, "");
    const expiryMatch = expiry.value.match(/^(\d{2})\/(\d{2})$/);

    const checks = [
        setFieldValidity(name, name.value.trim().length >= 3),
        setFieldValidity(phone, /^09\d{9}$/.test(phoneDigits)),
        setFieldValidity(address, address.value.trim().length >= 10),
        setFieldValidity(card, cardDigits.length === 16),
        setFieldValidity(expiry, Boolean(expiryMatch) && Number(expiryMatch[1]) >= 1 && Number(expiryMatch[1]) <= 12),
        setFieldValidity(cvv, /^\d{3,4}$/.test(cvv.value))
    ];

    return checks.every(Boolean);
}

function setupCheckoutForm() {
    const form = document.getElementById("checkoutForm");
    if (!form) return;

    const cardInput = document.getElementById("cardNumber");
    const expiryInput = document.getElementById("expiryDate");
    const phoneInput = document.getElementById("customerPhone");
    const cvvInput = document.getElementById("cvv");

    cardInput.addEventListener("input", () => {
        const digits = cardInput.value.replace(/\D/g, "").slice(0, 16);
        cardInput.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
        cardInput.classList.remove("input-error");
    });

    expiryInput.addEventListener("input", () => {
        const digits = expiryInput.value.replace(/\D/g, "").slice(0, 4);
        expiryInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
        expiryInput.classList.remove("input-error");
    });

    phoneInput.addEventListener("input", () => {
        phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 11);
        phoneInput.classList.remove("input-error");
    });

    cvvInput.addEventListener("input", () => {
        cvvInput.value = cvvInput.value.replace(/\D/g, "").slice(0, 4);
        cvvInput.classList.remove("input-error");
    });

    form.querySelectorAll("input, textarea").forEach((field) => {
        field.addEventListener("input", () => field.classList.remove("input-error"));
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!validateCheckoutForm()) {
            showToast("Ù„Ø·ÙØ§Ù‹ Ø§Ø·Ù„Ø§Ø¹Ø§Øª ÙØ±Ù… Ø±Ø§ Ú©Ø§Ù…Ù„ Ùˆ ØµØ­ÛŒØ­ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯.", "error");
            form.querySelector(".input-error")?.focus();
            return;
        }

        const button = document.getElementById("payButton");
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i> Ø¯Ø± Ø­Ø§Ù„ Ù¾Ø±Ø¯Ø§Ø²Ø´...</span>';

        window.setTimeout(() => {
            const cart = getCart();
            const totals = getCartTotals(cart);
            const orderCode = `W2-${Date.now().toString().slice(-6)}`;
            const receiptDate = new Intl.DateTimeFormat("fa-IR", {
                dateStyle: "long",
                timeStyle: "short"
            }).format(new Date());
            const receiptItems = cart.map((item) => {
                const product = getProduct(item.id);
                return {
                    name: product.name,
                    quantity: item.quantity
                };
            });

            renderReceipt({
                orderCode,
                date: receiptDate,
                amount: formatPrice(totals.price),
                items: receiptItems
            });

            /* Save order to history and update user stats */
            const user = getCurrentUser();
            if (user) {
                const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
                orders.push({
                    code: orderCode,
                    date: receiptDate,
                    amount: totals.price,
                    itemCount: cart.reduce((s, i) => s + i.quantity, 0),
                    userPhone: user.phone
                });
                localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
                user.orderCount = (user.orderCount || 0) + 1;
                user.totalSpent = (user.totalSpent || 0) + totals.price;
                saveCurrentUser(user);
            }

            localStorage.removeItem(CART_KEY);
            localStorage.removeItem("cart");
            localStorage.removeItem(DISCOUNT_KEY);
            updateCartCount();
            document.getElementById("checkoutContent").hidden = true;
            document.getElementById("paymentSuccess").hidden = false;
            const successPanel = document.getElementById("paymentSuccess");
            successPanel.setAttribute("tabindex", "-1");
            successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
            successPanel.focus({ preventScroll: true });
            button.innerHTML = originalContent;
            button.disabled = false;
        }, 1100);
    });
}

function renderReceipt(receipt) {
    document.getElementById("orderCode").textContent = receipt.orderCode;
    document.getElementById("receiptDate").textContent = receipt.date;
    document.getElementById("receiptAmount").textContent = receipt.amount;

    const productsList = document.getElementById("receiptProducts");
    productsList.replaceChildren(...receipt.items.map((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = `${item.name} Ã— ${formatNumber(item.quantity)}`;
        return listItem;
    }));

    const downloadButton = document.getElementById("downloadReceipt");
    downloadButton.onclick = () => downloadReceipt(receipt);
}

function downloadReceipt(receipt) {
    const products = receipt.items
        .map((item) => `- ${item.name} Ã— ${formatNumber(item.quantity)}`)
        .join("\n");
    const content = [
        "WEB 2 - Ø±Ø³ÛŒØ¯ Ù¾Ø±Ø¯Ø§Ø®Øª",
        "--------------------",
        `Ø´Ù…Ø§Ø±Ù‡ Ø³ÙØ§Ø±Ø´: ${receipt.orderCode}`,
        `ØªØ§Ø±ÛŒØ®: ${receipt.date}`,
        `Ù…Ø¨Ù„Øº: ${receipt.amount}`,
        "Ù…Ø­ØµÙˆÙ„Ø§Øª:",
        products,
        "ÙˆØ¶Ø¹ÛŒØª: Ù¾Ø±Ø¯Ø§Ø®Øª Ù…ÙˆÙÙ‚"
    ].join("\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt-${receipt.orderCode}.txt`;
    link.click();
    URL.revokeObjectURL(url);
}

function setupTheme() {
    const button = document.getElementById("themeBtn");
    if (!button) return;

    const icon = button.querySelector("i");
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const savedTheme = localStorage.getItem(THEME_KEY);
    const useLightTheme = savedTheme === "light";
    applyTheme(useLightTheme, button, icon, themeMeta, false);

    button.addEventListener("click", () => {
        const useLightTheme = !document.body.classList.contains("light-theme");
        const theme = useLightTheme ? "light" : "dark";
        localStorage.setItem(THEME_KEY, theme);
        applyTheme(useLightTheme, button, icon, themeMeta);
    });
}

let themeSwitchFrame = 0;

function applyTheme(
    useLightTheme,
    button = document.getElementById("themeBtn"),
    icon = button?.querySelector("i"),
    themeMeta = document.querySelector('meta[name="theme-color"]'),
    optimizeSwitch = true
) {
    if (optimizeSwitch) {
        document.documentElement.classList.add("theme-switching");
        if (themeSwitchFrame) cancelAnimationFrame(themeSwitchFrame);
        themeSwitchFrame = requestAnimationFrame(() => {
            themeSwitchFrame = requestAnimationFrame(() => {
                document.documentElement.classList.remove("theme-switching");
                themeSwitchFrame = 0;
            });
        });
    }

    document.body.classList.toggle("light-theme", useLightTheme);

    if (button) {
        if (icon) {
            icon.classList.toggle("fa-moon", useLightTheme);
            icon.classList.toggle("fa-sun", !useLightTheme);
        }
        button.setAttribute("aria-label", useLightTheme ? "ÙØ¹Ø§Ù„ Ú©Ø±Ø¯Ù† ØªÙ… ØªÛŒØ±Ù‡" : "ÙØ¹Ø§Ù„ Ú©Ø±Ø¯Ù† ØªÙ… Ø±ÙˆØ´Ù†");
    }

    themeMeta?.setAttribute("content", useLightTheme ? "#f4f7ff" : "#050816");
}

function setupMobileMenu() {
    const button = document.getElementById("menuToggle");
    const nav = document.getElementById("mainNav");
    if (!button || !nav) return;

    const closeMenu = () => {
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Ø¨Ø§Ø² Ú©Ø±Ø¯Ù† Ù…Ù†Ùˆ");
        nav.classList.remove("open");
        document.body.classList.remove("menu-open");
    };

    button.addEventListener("click", () => {
        const willOpen = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(willOpen));
        button.setAttribute("aria-label", willOpen ? "Ø¨Ø³ØªÙ† Ù…Ù†Ùˆ" : "Ø¨Ø§Ø² Ú©Ø±Ø¯Ù† Ù…Ù†Ùˆ");
        nav.classList.toggle("open", willOpen);
        document.body.classList.toggle("menu-open", willOpen);
    });

    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("click", (event) => {
        if (window.innerWidth <= 860 && nav.classList.contains("open") && !nav.contains(event.target) && !button.contains(event.target)) {
            closeMenu();
        }
    });
    window.addEventListener("resize", () => {
        if (window.innerWidth > 860) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });
}

function setupContactForm() {
    const form = document.getElementById("contactForm");
    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        saveContactMessage({
            name: formData.get("name"),
            email: formData.get("email"),
            subject: formData.get("subject"),
            message: formData.get("message")
        });
        showToast("Ù¾ÛŒØ§Ù… Ø´Ù…Ø§ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø«Ø¨Øª Ø´Ø¯. Ø³Ù¾Ø§Ø³ Ø§Ø² Ù‡Ù…Ø±Ø§Ù‡ÛŒ Ø´Ù…Ø§!");
        form.reset();
    });
}

function renderAdminProducts() {
    const container = document.getElementById("product-list");
    const productCount = document.getElementById("adminProductCount");
    console.log(`[renderAdminProducts] Ø§Ø¬Ø±Ø§ Ø´Ø¯ â€” ØªØ¹Ø¯Ø§Ø¯ Ù…Ø­ØµÙˆÙ„Ø§Øª: ${products.length}`);
    if (!container) return;

    if (productCount) productCount.textContent = formatNumber(products.length);

    if (!products.length) {
        container.innerHTML = `
            <div class="admin-empty-state">
                <i class="fa-solid fa-box-open"></i>
                <h3>Ù‡Ù†ÙˆØ² Ù…Ø­ØµÙˆÙ„ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª</h3>
                <p>Ø§Ø² ÙØ±Ù… Ú©Ù†Ø§Ø± Ø§ÛŒÙ† Ø¨Ø®Ø´ Ù…Ø­ØµÙˆÙ„ Ø¬Ø¯ÛŒØ¯ Ø±Ø§ Ø§Ø¶Ø§ÙÙ‡ Ú©Ù†ÛŒØ¯.</p>
            </div>`;
        return;
    }

    container.innerHTML = products.map((product) => `
        <div class="admin-product-row" style="--accent:${normalizeAccent(product.accent)}">
            <span class="admin-product-icon"><i class="fa-solid ${normalizeIcon(product.icon)}"></i></span>
            <div class="admin-product-info">
                <strong>${escapeHTML(product.name)}</strong>
                <small>${escapeHTML(product.brand)}</small>
            </div>
            <span class="admin-product-price">${formatPrice(product.price)}</span>
            <span class="admin-product-stock">Ù…ÙˆØ¬ÙˆØ¯ÛŒ: ${formatNumber(product.stock)}</span>
            <button class="admin-edit-button" type="button" data-edit-product="${product.id}" aria-label="ÙˆÛŒØ±Ø§ÛŒØ´ ${escapeHTML(product.name)}"><i class="fa-regular fa-pen-to-square"></i> ÙˆÛŒØ±Ø§ÛŒØ´</button>
            <button class="admin-delete-button" type="button" data-delete-product="${product.id}" aria-label="Ø­Ø°Ù ${escapeHTML(product.name)}"><i class="fa-regular fa-trash-can"></i> Ø­Ø°Ù</button>
        </div>
    `).join("");
}

async function loadAdminProductsFromApi() {
    const response = await fetch(ADMIN_API_BASE);
    if (!response.ok) throw new Error("Ø¯Ø±ÛŒØ§ÙØª Ù…Ø­ØµÙˆÙ„Ø§Øª Ø§Ø² Ø³Ø±ÙˆØ± Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.");
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(list)) throw new Error("Ù¾Ø§Ø³Ø® Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø² Ø³Ø±ÙˆØ± Ø¯Ø±ÛŒØ§ÙØª Ø´Ø¯.");
    products = list.map(normalizeProduct).filter(Boolean);
    adminApiMode = true;
    renderAdminProducts();
}

function renderAdminMessages() {
    const messagesContainer = document.getElementById("adminMessages");
    const messageCount = document.getElementById("adminMessageCount");
    if (!messagesContainer) return;

    const messages = getContactMessages();
    if (messageCount) messageCount.textContent = formatNumber(messages.length);

    if (!messages.length) {
        messagesContainer.innerHTML = `
            <div class="admin-empty-state">
                <i class="fa-regular fa-envelope-open"></i>
                <h3>Ù‡Ù†ÙˆØ² Ù¾ÛŒØ§Ù…ÛŒ Ø¯Ø±ÛŒØ§ÙØª Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª</h3>
                <p>Ù¾ÛŒØ§Ù…â€ŒÙ‡Ø§ÛŒ ÙØ±Ù… ØªÙ…Ø§Ø³ Ø³Ø§ÛŒØª Ø¯Ø± Ø§ÛŒÙ† Ù‚Ø³Ù…Øª Ù†Ù…Ø§ÛŒØ´ Ø¯Ø§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.</p>
            </div>`;
        return;
    }

    messagesContainer.innerHTML = messages.map((item) => {
        const createdAt = new Date(item.createdAt);
        const displayDate = Number.isNaN(createdAt.getTime()) ? "Ø²Ù…Ø§Ù† Ù†Ø§Ù…Ø´Ø®Øµ" : dateFormatter.format(createdAt);
        return `
            <article class="admin-message-card">
                <div class="admin-message-head">
                    <div>
                        <strong>${escapeHTML(item.name)}</strong>
                        <a href="mailto:${encodeURIComponent(item.email)}">${escapeHTML(item.email)}</a>
                    </div>
                    <time datetime="${escapeHTML(item.createdAt)}">${escapeHTML(displayDate)}</time>
                </div>
                <h3>${escapeHTML(item.subject)}</h3>
                <p>${escapeHTML(item.message)}</p>
            </article>`;
    }).join("");
}

function unlockAdminPanel() {
    const loginView = document.getElementById("adminLoginView");
    const dashboard = document.getElementById("adminDashboard");
    if (loginView) loginView.hidden = true;
    if (dashboard) dashboard.hidden = false;
    renderAdminProducts();
    renderAdminMessages();
    loadAdminProductsFromApi().catch(() => {
        adminApiMode = false;
        showToast("Ø§ØªØµØ§Ù„ Ø¨Ù‡ API Ù…Ø¯ÛŒØ±ÛŒØª Ø¨Ø±Ù‚Ø±Ø§Ø± Ù†Ø´Ø¯Ø› Ø­Ø§Ù„Øª Ù…Ø­Ù„ÛŒ ÙØ¹Ø§Ù„ Ø§Ø³Øª.", "error");
    });
}

function setupAdminPanel() {
    if (document.body.dataset.page !== "admin") return;

    const loginForm = document.getElementById("adminLoginForm");
    const productForm = document.getElementById("adminProductForm");
    const logoutButton = document.getElementById("adminLogout");
    const isAuthenticated = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";

    if (isAuthenticated) unlockAdminPanel();

    loginForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const passwordInput = document.getElementById("adminPassword");
        if (passwordInput.value !== ADMIN_PASSWORD) {
            showToast("Ø±Ù…Ø² Ø¹Ø¨ÙˆØ± Ø§Ø´ØªØ¨Ø§Ù‡ Ø§Ø³Øª.", "error");
            passwordInput.select();
            return;
        }

        sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
        loginForm.reset();
        unlockAdminPanel();
        showToast("ÙˆØ±ÙˆØ¯ Ø¨Ù‡ Ù¾Ù†Ù„ Ù…Ø¯ÛŒØ±ÛŒØª Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.");
    });

    logoutButton?.addEventListener("click", () => {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        window.location.reload();
    });

    productForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!productForm.checkValidity()) {
            productForm.reportValidity();
            return;
        }

        const formData = new FormData(productForm);
        try {
            const payload = {
                name: formData.get("name"),
                price: formData.get("price"),
                description: formData.get("description"),
                category: formData.get("category"),
                stock: formData.get("stock"),
                image: formData.get("image")
            };
            if (adminApiMode) {
                const response = await fetch(ADMIN_API_BASE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error("Ø«Ø¨Øª Ù…Ø­ØµÙˆÙ„ Ø¯Ø± Ø³Ø±ÙˆØ± Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.");
                const product = normalizeProduct(await response.json());
                products.push(product);
                renderAdminProducts();
                productForm.reset();
                showToast(`${product.name} Ø¨Ù‡ ÙØ±ÙˆØ´Ú¯Ø§Ù‡ Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯.`);
                return;
            }
            const product = createProduct(payload);
            productForm.reset();
            renderAdminProducts();
            showToast(`${product.name} Ø¨Ù‡ ÙØ±ÙˆØ´Ú¯Ø§Ù‡ Ø§Ø¶Ø§ÙÙ‡ Ø´Ø¯.`);
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    document.getElementById("product-list")?.addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-product]");
        if (editButton) {
            const product = getProduct(editButton.dataset.editProduct);
            if (!product) return;
            const name = window.prompt("Ù†Ø§Ù… Ù…Ø­ØµÙˆÙ„", product.name);
            const price = window.prompt("Ù‚ÛŒÙ…Øª", String(product.price));
            if (!name || !Number.isFinite(Number(price)) || Number(price) <= 0) return;
            const updated = normalizeProduct({ ...product, name: name.trim(), price: Math.round(Number(price)) });
            if (adminApiMode) {
                fetch(`${ADMIN_API_BASE}/${encodeURIComponent(product.id)}`, {
                    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated)
                }).then((response) => {
                    if (!response.ok) throw new Error("ÙˆÛŒØ±Ø§ÛŒØ´ Ù…Ø­ØµÙˆÙ„ Ø¯Ø± Ø³Ø±ÙˆØ± Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.");
                    return response.json();
                }).then((saved) => {
                    products = products.map((item) => String(item.id) === String(saved.id) ? normalizeProduct(saved) : item);
                    renderAdminProducts();
                    showToast("Ù…Ø­ØµÙˆÙ„ ÙˆÛŒØ±Ø§ÛŒØ´ Ø´Ø¯.");
                }).catch((error) => showToast(error.message, "error"));
            } else {
                products = products.map((item) => String(item.id) === String(product.id) ? updated : item);
                saveProducts(products);
                renderAdminProducts();
                showToast("Ù…Ø­ØµÙˆÙ„ ÙˆÛŒØ±Ø§ÛŒØ´ Ø´Ø¯.");
            }
            return;
        }
        const deleteButton = event.target.closest("[data-delete-product]");
        if (!deleteButton) return;

        const product = getProduct(deleteButton.dataset.deleteProduct);
        if (!product || !window.confirm(`Ù…Ø­ØµÙˆÙ„ Â«${product.name}Â» Ø­Ø°Ù Ø´ÙˆØ¯ØŸ`)) return;

        if (adminApiMode) {
            fetch(`${ADMIN_API_BASE}/${encodeURIComponent(product.id)}`, { method: "DELETE" })
                .then((response) => {
                    if (!response.ok) throw new Error("Ø­Ø°Ù Ù…Ø­ØµÙˆÙ„ Ø¯Ø± Ø³Ø±ÙˆØ± Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.");
                    products = products.filter((item) => String(item.id) !== String(product.id));
                    renderAdminProducts();
                    showToast(`${product.name} Ø­Ø°Ù Ø´Ø¯.`);
                })
                .catch((error) => showToast(error.message, "error"));
            return;
        }
        deleteProduct(product.id);
        renderAdminProducts();
        showToast(`${product.name} Ø­Ø°Ù Ø´Ø¯.`);
    });
}

function setupGlobalActions() {
    document.addEventListener("click", (event) => {
        const addButton = event.target.closest("[data-add-to-cart]");
        if (addButton) {
            addToCart(addButton.dataset.addToCart);
            return;
        }

        const cartButton = event.target.closest("[data-cart-action]");
        if (!cartButton) return;

        const productId = cartButton.dataset.productId;
        const action = cartButton.dataset.cartAction;
        if (action === "increase") changeCartQuantity(productId, 1);
        if (action === "decrease") changeCartQuantity(productId, -1);
        if (action === "remove") removeCartItem(productId);
    });
}

function setupStorageSync() {
    window.addEventListener("storage", (event) => {
        if (event.key === PRODUCTS_KEY) {
            products = getProducts();
            renderHomeDiscovery();
            renderProducts();
            renderProductDetail();
            renderCart();
            renderCheckout();
            renderAdminProducts();
        }

        if (event.key === CART_KEY || event.key === "cart") {
            renderCart();
            renderCheckout();
            updateCartCount();
        }

        if (event.key === MESSAGES_KEY) renderAdminMessages();

        if (event.key === THEME_KEY) {
            const useLightTheme = event.newValue === "light";
            applyTheme(useLightTheme);
        }
    });
}

function initializeStore() {
    products = getProducts();
    loadProductsFromApi().then(() => {
        renderHomeDiscovery();
        renderProducts();
        renderProductDetail();
        renderCart();
        renderCheckout();
        renderAdminProducts();
    });
    setupTheme();
    setupAuthUI();
    setupMobileMenu();
    setupGlobalActions();
    setupStorageSync();
    setupContactForm();
    setupAdminPanel();
    renderHomeDiscovery();
    setupProductControls();
    setupDiscountForm();
    setupBackToTop();
    renderProducts();
    renderProductDetail();
    renderCart();
    renderCheckout();
    setupCheckoutForm();
    updateCartCount();
}

document.addEventListener("DOMContentLoaded", initializeStore);


