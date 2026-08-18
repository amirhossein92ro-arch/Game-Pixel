import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function Cart() {
  const { cart, removeFromCart, updateQuantity, cartTotal } = useCart();

  if (cart.length === 0) {
    return (
      <section className="section">
        <div className="cart-empty">
          <h2>Your Cart is Empty</h2>
          <p>Add some games to your cart to get started!</p>
          <Link to="/products">
            <button className="btn btn-primary btn-large">Browse Games</button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-page">
      <h1>Shopping Cart</h1>
      <div className="cart-items">
        {cart.map(item => (
          <div key={item.id} className="cart-item">
            <div className="cart-item-image">
              <img src={item.image} alt={item.name} />
            </div>
            <div className="cart-item-info">
              <h3 className="cart-item-title">{item.name}</h3>
              <div className="cart-item-price">
                {item.price === 0 ? 'FREE' : `$${item.price}`}
              </div>
              <div className="cart-item-actions">
                <div className="quantity-controls">
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                </div>
                <button className="remove-btn" onClick={() => removeFromCart(item.id)}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Subtotal ({cart.reduce((sum, item) => sum + item.quantity, 0)} items)</span>
          <span>${cartTotal.toFixed(2)}</span>
        </div>
        <div className="cart-summary-row">
          <span>Shipping</span>
          <span style={{ color: 'var(--neon-green)' }}>Free</span>
        </div>
        <div className="cart-summary-row cart-total">
          <span>Total</span>
          <span className="total-price">${cartTotal.toFixed(2)}</span>
        </div>
        <button className="btn btn-primary btn-large" style={{ width: '100%', marginTop: '1rem' }}>
          Proceed to Checkout
        </button>
      </div>
    </section>
  );
}

export default Cart;