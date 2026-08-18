import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { formatPrice } from "../data/products";
import "./Cart.css";

export default function Cart() {
  const { items, removeItem, updateQty, clearCart, totalPrice } = useCart();

  if (items.length === 0) {
    return (
      <main className="cart-empty">
        <div className="cart-empty__icon">
          <i className="fa-solid fa-bag-shopping" />
        </div>
        <h1>Your Cart is Empty</h1>
        <p>Looks like you haven't added anything yet.</p>
        <Link to="/category/all" className="cart-empty__btn">
          <i className="fa-solid fa-gamepad" /> Start Shopping
        </Link>
      </main>
    );
  }

  return (
    <main className="cart">
      <h1 className="cart__title">Shopping Cart</h1>
      <p className="cart__count">{items.length} item{items.length !== 1 ? "s" : ""} in your cart</p>

      <div className="cart__layout">
        <div className="cart__items">
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <Link
                to={`/product/${item.id}`}
                className="cart-item__icon"
              >
                <i className={`fa-solid ${item.icon}`} />
              </Link>
              <div className="cart-item__info">
                <Link
                  to={`/product/${item.id}`}
                  className="cart-item__name"
                >
                  {item.name}
                </Link>
                <span className="cart-item__price">
                  {formatPrice(item.price)}
                </span>
              </div>
              <div className="cart-item__qty">
                <button
                  onClick={() => updateQty(item.id, item.qty - 1)}
                  disabled={item.qty <= 1}
                >
                  <i className="fa-solid fa-minus" />
                </button>
                <span>{item.qty}</span>
                <button onClick={() => updateQty(item.id, item.qty + 1)}>
                  <i className="fa-solid fa-plus" />
                </button>
              </div>
              <div className="cart-item__subtotal">
                {formatPrice(item.price * item.qty)}
              </div>
              <button
                className="cart-item__remove"
                onClick={() => removeItem(item.id)}
                aria-label="Remove item"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          ))}
        </div>

        <div className="cart__summary">
          <h2>Order Summary</h2>

          <div className="cart__line">
            <span>Subtotal</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          <div className="cart__line">
            <span>Shipping</span>
            <span className="cart__free">Free</span>
          </div>
          <div className="cart__line cart__line--total">
            <span>Total</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>

          <button className="cart__checkout">
            <i className="fa-solid fa-lock" /> Checkout
          </button>

          <button className="cart__clear" onClick={clearCart}>
            Clear Cart
          </button>

          <Link to="/category/all" className="cart__continue">
            <i className="fa-solid fa-arrow-left" /> Continue Shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
