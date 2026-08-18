import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ProductCard from '../components/ProductCard';

function Home() {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const res = await axios.get('/api/products?featured=true');
        setFeaturedProducts(res.data);
      } catch (err) {
        console.error('Failed to fetch featured products:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeatured();
  }, []);

  return (
    <div>
      <section className="hero">
        <div className="hero-content">
          <h1>
            LEVEL UP YOUR <span>GAMING</span>
          </h1>
          <p>Discover the latest titles, exclusive deals, and everything you need to dominate the competition.</p>
          <div className="hero-buttons">
            <Link to="/products">
              <button className="btn btn-primary btn-large">Browse Games</button>
            </Link>
            <Link to="/categories">
              <button className="btn btn-secondary btn-large">Explore Categories</button>
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Featured <span>Games</span></h2>
          <Link to="/products?featured=true">
            <button className="btn btn-secondary">View All</button>
          </Link>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Loading...
          </div>
        ) : (
          <div className="products-grid">
            {featuredProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">All <span>Products</span></h2>
          <Link to="/products">
            <button className="btn btn-secondary">View All</button>
          </Link>
        </div>
        <div className="products-grid">
          {featuredProducts.slice(0, 4).map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default Home;