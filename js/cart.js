(() => {
  const cartContent = document.getElementById("cart-content");
  const cartItemsContainer = document.getElementById("cart-items");
  const cartTotalElement = document.getElementById("cart-total");
  const orderSummary = document.getElementById("order-summary");

  const readCart = () => {
    try {
      const storedCart = JSON.parse(localStorage.getItem("cart") || "[]");
      return Array.isArray(storedCart) ? storedCart : [];
    } catch {
      return [];
    }
  };

  const saveCart = (cart) => {
    localStorage.setItem("cart", JSON.stringify(cart));
  };

  const formatPrice = (value) => `${Number(value || 0).toLocaleString("fa-IR")} تومان`;

  const getQuantity = (item) => {
    const quantity = Number(item.quantity);
    return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  };

  const calculateTotal = (cart) =>
    cart.reduce((total, item) => total + Number(item.price || 0) * getQuantity(item), 0);

  const createCartItem = (item) => {
    const article = document.createElement("article");
    article.className = "cart-item";

    const imageWrap = document.createElement("div");
    imageWrap.className = "cart-item-image-wrap";

    const image = document.createElement("img");
    image.className = "cart-item-image";
    image.src = window.Web2SafeURL?.image(item.image) || "img/product-placeholder.svg";
    image.alt = item.name || "محصول";
    image.loading = "lazy";
    imageWrap.appendChild(image);

    const details = document.createElement("div");

    const name = document.createElement("h2");
    name.className = "cart-item-name";
    name.textContent = item.name || "محصول بدون نام";

    const meta = document.createElement("div");
    meta.className = "cart-item-meta";

    const price = document.createElement("span");
    price.className = "cart-item-price";
    price.textContent = formatPrice(item.price);

    const quantity = document.createElement("span");
    quantity.textContent = `تعداد: ${getQuantity(item).toLocaleString("fa-IR")}`;

    meta.append(price, quantity);
    details.append(name, meta);

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.textContent = "حذف";
    removeButton.setAttribute("aria-label", `حذف ${item.name || "محصول"} از سبد خرید`);
    removeButton.addEventListener("click", () => {
      const updatedCart = readCart().filter(
        (cartItem) => String(cartItem.id) !== String(item.id)
      );
      saveCart(updatedCart);
      renderCart();
    });

    article.append(imageWrap, details, removeButton);
    return article;
  };

  const renderEmptyState = () => {
    cartContent.replaceChildren();

    const emptyState = document.createElement("section");
    emptyState.className = "empty-state";

    const title = document.createElement("h2");
    title.textContent = "سبد خرید شما خالی است";

    const message = document.createElement("p");
    message.textContent = "هنوز هیچ تجهیزات گیمینگی به سبد خرید اضافه نکرده‌اید.";

    const shopLink = document.createElement("a");
    shopLink.className = "primary-button";
    shopLink.href = "index.html";
    shopLink.textContent = "بازگشت به فروشگاه";

    emptyState.append(title, message, shopLink);
    cartContent.appendChild(emptyState);
    localStorage.removeItem("checkoutTotal");
  };

  const renderCart = () => {
    const cart = readCart();

    if (cart.length === 0) {
      renderEmptyState();
      return;
    }

    if (!cartContent.contains(cartItemsContainer)) {
      cartContent.replaceChildren();

      const itemsSection = document.createElement("section");
      itemsSection.appendChild(cartItemsContainer);
      cartContent.append(itemsSection, orderSummary);
    }

    cartItemsContainer.replaceChildren(...cart.map(createCartItem));

    const total = calculateTotal(cart);
    cartTotalElement.textContent = formatPrice(total);
    localStorage.setItem("checkoutTotal", String(total));
  };

  renderCart();
})();
