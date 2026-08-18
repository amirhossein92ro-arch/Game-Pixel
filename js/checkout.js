(() => {
  const form = document.getElementById("payment-form");
  const cardNumberInput = document.getElementById("card-number");
  const cardHolderInput = document.getElementById("card-holder");
  const cvv2Input = document.getElementById("cvv2");
  const expiryMonthInput = document.getElementById("expiry-month");
  const expiryYearInput = document.getElementById("expiry-year");
  const paymentAmountInput = document.getElementById("payment-amount");
  const payButton = document.getElementById("pay-button");
  const formMessage = document.getElementById("form-message");
  const cardNumberPreview = document.getElementById("card-number-preview");
  const cardHolderPreview = document.getElementById("card-holder-preview");
  const expiryPreview = document.getElementById("expiry-preview");

  const onlyDigits = (value) => value.replace(/\D/g, "");
  const formatPrice = (value) => `${Number(value || 0).toLocaleString("fa-IR")} تومان`;

  const readCart = () => {
    try {
      const storedCart = JSON.parse(localStorage.getItem("cart") || "[]");
      return Array.isArray(storedCart) ? storedCart : [];
    } catch {
      return [];
    }
  };

  const getQuantity = (item) => {
    const quantity = Number(item.quantity);
    return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  };

  const calculateCartTotal = () =>
    readCart().reduce(
      (total, item) => total + Number(item.price || 0) * getQuantity(item),
      0
    );

  const storedTotal = Number(localStorage.getItem("checkoutTotal"));
  const cartTotal = calculateCartTotal();
  const paymentTotal = cartTotal > 0 ? cartTotal : Number.isFinite(storedTotal) ? storedTotal : 0;

  paymentAmountInput.value = formatPrice(paymentTotal);

  if (paymentTotal <= 0) {
    formMessage.textContent = "سبد خرید خالی است. ابتدا محصولی به سبد خرید اضافه کنید.";
    formMessage.className = "form-message error is-visible";
    payButton.disabled = true;
  }

  const setError = (fieldName, message) => {
    document.getElementById(`${fieldName}-error`).textContent = message;
  };

  const clearErrors = () => {
    ["card-number", "card-holder", "cvv2", "expiry-month", "expiry-year"].forEach(
      (fieldName) => setError(fieldName, "")
    );
    formMessage.textContent = "";
    formMessage.className = "form-message";
  };

  const formatCardNumber = (value) =>
    onlyDigits(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");

  cardNumberInput.addEventListener("input", () => {
    cardNumberInput.value = formatCardNumber(cardNumberInput.value);
    cardNumberPreview.textContent = cardNumberInput.value || "•••• •••• •••• ••••";
  });

  cardHolderInput.addEventListener("input", () => {
    cardHolderPreview.textContent =
      cardHolderInput.value.trim().toUpperCase() || "YOUR NAME";
  });

  [cvv2Input, expiryMonthInput, expiryYearInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = onlyDigits(input.value);
    });
  });

  const updateExpiryPreview = () => {
    const month = expiryMonthInput.value || "MM";
    const year = expiryYearInput.value ? expiryYearInput.value.slice(-2) : "YY";
    expiryPreview.textContent = `${month}/${year}`;
  };

  expiryMonthInput.addEventListener("input", updateExpiryPreview);
  expiryYearInput.addEventListener("input", updateExpiryPreview);

  const validateForm = () => {
    clearErrors();
    let isValid = true;

    if (onlyDigits(cardNumberInput.value).length !== 16) {
      setError("card-number", "شماره کارت باید دقیقاً ۱۶ رقم باشد.");
      isValid = false;
    }

    if (!cardHolderInput.value.trim()) {
      setError("card-holder", "نام دارنده کارت را وارد کنید.");
      isValid = false;
    }

    if (!/^\d{3,4}$/.test(cvv2Input.value)) {
      setError("cvv2", "CVV2 باید ۳ یا ۴ رقم باشد.");
      isValid = false;
    }

    const month = Number(expiryMonthInput.value);
    if (!expiryMonthInput.value || month < 1 || month > 12) {
      setError("expiry-month", "ماه انقضا باید بین ۱ تا ۱۲ باشد.");
      isValid = false;
    }

    if (!expiryYearInput.value) {
      setError("expiry-year", "سال انقضا را وارد کنید.");
      isValid = false;
    }

    if (paymentTotal <= 0) {
      formMessage.textContent = "مبلغ پرداخت معتبر نیست.";
      formMessage.className = "form-message error is-visible";
      isValid = false;
    }

    return isValid;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    payButton.disabled = true;
    formMessage.textContent = "Payment Successful! Your order has been placed.";
    formMessage.className = "form-message success is-visible";
    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutTotal");

    window.setTimeout(() => {
      window.location.href = "index.html";
    }, 2000);
  });
})();
