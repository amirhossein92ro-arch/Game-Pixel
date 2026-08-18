import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useCart } from '../context/CartContext';

function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { addToCart } = useCart();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await axios.get(`/api/products/${id}`);
        setProduct(res.data);
      } catch (err) {
        setError('Product not found');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        <h2>{error}</h2>
        <Link to="/products" style={{ color: 'var(--neon-purple)', marginTop: '1rem', display: 'inline-block' }}>
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div className="product-detail">
      <Link to="/products" style={{ color: 'var(--neon-purple)', marginBottom: '1rem', display: 'inline-block' }}>
        ← Back to Products
      </Link>
      <div className="product-detail-grid">
        <div className="product-detail-image">
          <img src={product.image} alt={product.name} />
        </div>
        <div className="product-detail-info">
          <div className="product-category">{product.category}</div>
          <h1>{product.name}</h1>
          <div className="product-rating">
            <span className="stars">{'★'.repeat(Math.floor(product.rating))}{'☆'.repeat(5 - Math.floor(product.rating))}</span>
            <span className="review-count">{product.rating} ({product.reviews.toLocaleString()} reviews)</span>
          </div>
          <div className="product-price" style={{ marginBottom: '1.5rem' }}>
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
          <p className="product-description">{product.description}</p>
          <div className="product-tags">
            {product.tags.map((tag, i) => (
              <span key={i} className="tag">{tag}</span>
            ))}
          </div>
          <div className="stock-status">
            {product.inStock ? (
              <span className="in-stock">✓ In Stock</span>
            ) : (
              <span className="out-of-stock">✗ Out of Stock</span>
            )}
          </div>
          <button
            className="btn btn-primary btn-large"
            onClick={() => addToCart(product)}
            disabled={!product.inStock}
            style={{ opacity: product.inStock ? 1 : 0.5 }}
          >
            {product.inStock ? 'Add to Cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductDetail;