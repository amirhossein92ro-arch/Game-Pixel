import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

function ProductCard({ product }) {
  const { addToCart } = useCart();

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
  };

  return (
    <Link to={`/products/${product.id}`} className="product-card">
      <div className="product-card-image">
        <img src={product.image} alt={product.name} />
        {product.price === 0 ? (
          <span className="product-badge product-free-badge">FREE</span>
        ) : product.originalPrice > product.price && (
          <span className="product-badge">
            -{Math.round((1 - product.price / product.originalPrice) * 100)}%
          </span>
        )}
      </div>
      <div className="product-card-body">
        <div className="product-category">{product.category}</div>
        <h3 className="product-title">{product.name}</h3>
        <div className="product-rating">
          <span className="stars">{'★'.repeat(Math.floor(product.rating))}{'☆'.repeat(5 - Math.floor(product.rating))}</span>
          <span className="review-count">({product.reviews.toLocaleString()})</span>
        </div>
        <div className="product-price">
          {product.price === 0 ? (
            <span className="current-price">FREE</span>
          ) : (
            <>
              <span className="current-price">${product.price}</span>
              {product.originalPrice > product.price && (
                <span className="original-price">${product.originalPrice}</span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export default ProductCard;