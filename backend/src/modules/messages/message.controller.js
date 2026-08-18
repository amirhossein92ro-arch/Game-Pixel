const Message = require("./message.model");
const { createError } = require("../../middleware/error.middleware");

// POST /api/messages — ثبت پیام تماس (عمومی)
async function createMessage(req, res, next) {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      throw createError(400, "تمام فیلدها (نام، ایمیل، موضوع، متن) الزامی هستند.");
    }
    const created = await Message.create({ name, email, subject, message });
    res.status(201).json({ message: "پیام شما ثبت شد.", id: created._id });
  } catch (e) { next(e); }
}

// GET /api/messages — فهرست پیام‌ها (admin)
async function listMessages(req, res, next) {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (e) { next(e); }
}

// PUT /api/messages/:id/read — علامت‌گذاری به‌عنوان خوانده‌شده (admin)
async function markRead(req, res, next) {
  try {
    const updated = await Message.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!updated) throw createError(404, "پیام پیدا نشد.");
    res.json(updated);
  } catch (e) { next(e); }
}

module.exports = { createMessage, listMessages, markRead };
