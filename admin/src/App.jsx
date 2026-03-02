import { Fragment, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useContentTypes } from './context/ContentTypesContext';
import Layout from './components/Layout';
import Login from './core/Login';
import Dashboard from './core/Dashboard';

// Dynamic imports for better performance
const Pages = lazy(() => import('./pages/Pages'));
const PageEditor = lazy(() => import('./pages/PageEditor'));
const Posts = lazy(() => import('./pages/Posts'));
const PostEditor = lazy(() => import('./pages/PostEditor'));
const Templates = lazy(() => import('./settings/Templates'));
const TemplateEditor = lazy(() => import('./settings/TemplateEditor'));
const Media = lazy(() => import('./settings/Media'));
const Menus = lazy(() => import('./settings/Menus'));
const Blocks = lazy(() => import('./blocks/Blocks'));
const BlockEditor = lazy(() => import('./blocks/BlockEditor'));
const Widgets = lazy(() => import('./widgets/Widgets'));
const WidgetEditor = lazy(() => import('./widgets/WidgetEditor'));
const Settings = lazy(() => import('./settings/Settings'));
const SEO = lazy(() => import('./settings/SEO'));
const SiteImporter = lazy(() => import('./pages/SiteImporter'));
const AssistedImporter = lazy(() => import('./pages/AssistedImporter'));
const LovableImporter = lazy(() => import('./pages/LovableImporter'));
const ContentList = lazy(() => import('./content/ContentList'));
const ContentEditor = lazy(() => import('./content/ContentEditor'));
const ProductList = lazy(() => import('./products/ProductList'));
const ProductEditor = lazy(() => import('./products/ProductEditor'));
const OrderList = lazy(() => import('./orders/OrderList'));
const OrderDetail = lazy(() => import('./orders/OrderDetail'));
const GroupList = lazy(() => import('./groups/GroupList'));
const GroupEditor = lazy(() => import('./groups/GroupEditor'));
const UserList = lazy(() => import('./users/UserList'));
const UserEditor = lazy(() => import('./users/UserEditor'));
const CustomerList = lazy(() => import('./customers/CustomerList'));
const CustomerDetail = lazy(() => import('./customers/CustomerDetail'));
const TenantList = lazy(() => import('./tenants/TenantList'));
const Sites = lazy(() => import('./tenants/Sites'));
const MySites = lazy(() => import('./tenants/MySites'));
const Themes = lazy(() => import('./settings/Themes'));
const WpThemeImport = lazy(() => import('./settings/WpThemeImport'));
const StyleEditor = lazy(() => import('./settings/StyleEditor'));
const EmailTemplates = lazy(() => import('./settings/EmailTemplates'));
const ApiKeys = lazy(() => import('./settings/ApiKeys'));
const WooCommerceKeys = lazy(() => import('./pages/WooCommerceKeys'));
const PlanList = lazy(() => import('./subscriptions/PlanList'));
const PlanEditor = lazy(() => import('./subscriptions/PlanEditor'));
const CouponList = lazy(() => import('./marketing/CouponList'));
const CouponEditor = lazy(() => import('./marketing/CouponEditor'));
const ClassifiedList = lazy(() => import('./classifieds/ClassifiedList'));
const ClassifiedDetail = lazy(() => import('./classifieds/ClassifiedDetail'));
const ClassifiedSettings = lazy(() => import('./classifieds/ClassifiedSettings'));
const MyClassifieds = lazy(() => import('./classifieds/MyClassifieds'));
const ShipStation = lazy(() => import('./orders/ShipStation'));

// Loading component for lazy-loaded routes
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function App() {
  const { user } = useAuth();
  const { contentTypes } = useContentTypes();

  // Block admin panel on the bare/default domain (no subdomain), but allow it
  // on any subdomain (admin.*, tenant.*, etc.) and on localhost
  useEffect(() => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname.startsWith('127.0.0.1');
    // Count domain parts: "wolfwave.shop" = 2 (bare domain), "anything.wolfwave.shop" = 3+ (has subdomain)
    const parts = hostname.split('.');
    const hasSubdomain = parts.length > 2;

    if (!hasSubdomain && !isLocalhost) {
      // Bare domain with no subdomain - block access
      document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;"><h1>404 - Not Found</h1></div>';
    }
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pages" element={<Suspense fallback={<LoadingSpinner />}><Pages /></Suspense>} />
                <Route path="/pages/new" element={<Suspense fallback={<LoadingSpinner />}><PageEditor /></Suspense>} />
                <Route path="/pages/:id" element={<Suspense fallback={<LoadingSpinner />}><PageEditor /></Suspense>} />
                <Route path="/posts" element={<Suspense fallback={<LoadingSpinner />}><Posts /></Suspense>} />
                <Route path="/posts/new" element={<Suspense fallback={<LoadingSpinner />}><PostEditor /></Suspense>} />
                <Route path="/posts/:id" element={<Suspense fallback={<LoadingSpinner />}><PostEditor /></Suspense>} />
                <Route path="/templates" element={<Suspense fallback={<LoadingSpinner />}><Templates /></Suspense>} />
                <Route path="/media" element={<Suspense fallback={<LoadingSpinner />}><Media /></Suspense>} />
                <Route path="/menus" element={<Suspense fallback={<LoadingSpinner />}><Menus /></Suspense>} />
                <Route path="/blocks" element={<Suspense fallback={<LoadingSpinner />}><Blocks /></Suspense>} />
                <Route path="/blocks/new" element={<Suspense fallback={<LoadingSpinner />}><BlockEditor /></Suspense>} />
                <Route path="/blocks/:id" element={<Suspense fallback={<LoadingSpinner />}><BlockEditor /></Suspense>} />
                <Route path="/widgets" element={<Suspense fallback={<LoadingSpinner />}><Widgets /></Suspense>} />
                <Route path="/widgets/new" element={<Suspense fallback={<LoadingSpinner />}><WidgetEditor /></Suspense>} />
                <Route path="/widgets/:id" element={<Suspense fallback={<LoadingSpinner />}><WidgetEditor /></Suspense>} />
                <Route path="/seo" element={<Suspense fallback={<LoadingSpinner />}><SEO /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<LoadingSpinner />}><Settings /></Suspense>} />
                <Route path="/import" element={<Suspense fallback={<LoadingSpinner />}><SiteImporter /></Suspense>} />
                <Route path="/assisted-import" element={<Suspense fallback={<LoadingSpinner />}><AssistedImporter /></Suspense>} />
                <Route path="/import-lovable" element={<Suspense fallback={<LoadingSpinner />}><LovableImporter /></Suspense>} />
                <Route path="/products" element={<Suspense fallback={<LoadingSpinner />}><ProductList /></Suspense>} />
                <Route path="/products/new" element={<Suspense fallback={<LoadingSpinner />}><ProductEditor /></Suspense>} />
                <Route path="/products/:id" element={<Suspense fallback={<LoadingSpinner />}><ProductEditor /></Suspense>} />
                <Route path="/orders" element={<Suspense fallback={<LoadingSpinner />}><OrderList /></Suspense>} />
                <Route path="/orders/:id" element={<Suspense fallback={<LoadingSpinner />}><OrderDetail /></Suspense>} />
                <Route path="/shipstation" element={<Suspense fallback={<LoadingSpinner />}><ShipStation /></Suspense>} />
                <Route path="/groups" element={<Suspense fallback={<LoadingSpinner />}><GroupList /></Suspense>} />
                <Route path="/groups/new" element={<Suspense fallback={<LoadingSpinner />}><GroupEditor /></Suspense>} />
                <Route path="/groups/:id" element={<Suspense fallback={<LoadingSpinner />}><GroupEditor /></Suspense>} />
                <Route path="/users" element={<Suspense fallback={<LoadingSpinner />}><UserList /></Suspense>} />
                <Route path="/users/new" element={<Suspense fallback={<LoadingSpinner />}><UserEditor /></Suspense>} />
                <Route path="/users/:id" element={<Suspense fallback={<LoadingSpinner />}><UserEditor /></Suspense>} />
                <Route path="/customers" element={<Suspense fallback={<LoadingSpinner />}><CustomerList /></Suspense>} />
                <Route path="/customers/:id" element={<Suspense fallback={<LoadingSpinner />}><CustomerDetail /></Suspense>} />
                <Route path="/subscriptions" element={<Suspense fallback={<LoadingSpinner />}><PlanList /></Suspense>} />
                <Route path="/subscriptions/new" element={<Suspense fallback={<LoadingSpinner />}><PlanEditor /></Suspense>} />
                <Route path="/subscriptions/:id" element={<Suspense fallback={<LoadingSpinner />}><PlanEditor /></Suspense>} />
                <Route path="/marketing/coupons" element={<Suspense fallback={<LoadingSpinner />}><CouponList /></Suspense>} />
                <Route path="/marketing/coupons/new" element={<Suspense fallback={<LoadingSpinner />}><CouponEditor /></Suspense>} />
                <Route path="/marketing/coupons/:id" element={<Suspense fallback={<LoadingSpinner />}><CouponEditor /></Suspense>} />
                <Route path="/sites" element={<Suspense fallback={<LoadingSpinner />}><Sites /></Suspense>} />
                <Route path="/my-sites" element={<Suspense fallback={<LoadingSpinner />}><MySites /></Suspense>} />
                <Route path="/templates" element={<Suspense fallback={<LoadingSpinner />}><Templates /></Suspense>} />
                <Route path="/templates/editor" element={<Suspense fallback={<LoadingSpinner />}><TemplateEditor /></Suspense>} />
                <Route path="/themes" element={<Suspense fallback={<LoadingSpinner />}><Themes /></Suspense>} />
                <Route path="/themes/import" element={<Suspense fallback={<LoadingSpinner />}><WpThemeImport /></Suspense>} />
                <Route path="/styles" element={<Suspense fallback={<LoadingSpinner />}><StyleEditor /></Suspense>} />
                <Route path="/email-templates" element={<Suspense fallback={<LoadingSpinner />}><EmailTemplates /></Suspense>} />
                <Route path="/api-keys" element={<Suspense fallback={<LoadingSpinner />}><ApiKeys /></Suspense>} />
                <Route path="/woocommerce-keys" element={<Suspense fallback={<LoadingSpinner />}><WooCommerceKeys /></Suspense>} />
                <Route path="/classifieds" element={<Suspense fallback={<LoadingSpinner />}><ClassifiedList /></Suspense>} />
                <Route path="/classifieds/settings" element={<Suspense fallback={<LoadingSpinner />}><ClassifiedSettings /></Suspense>} />
                <Route path="/classifieds/my-ads" element={<Suspense fallback={<LoadingSpinner />}><MyClassifieds /></Suspense>} />
                <Route path="/classifieds/:id" element={<Suspense fallback={<LoadingSpinner />}><ClassifiedDetail /></Suspense>} />

                {/* Global Admin Only Routes */}
                {user?.is_global && (
                  <Route path="/tenants" element={<Suspense fallback={<LoadingSpinner />}><TenantList /></Suspense>} />
                )}
                {contentTypes.map(type => (
                  <Fragment key={type.name}>
                    <Route
                      path={`/${type.name}`}
                      element={<Suspense fallback={<LoadingSpinner />}><ContentList /></Suspense>}
                    />
                    <Route
                      path={`/${type.name}/new`}
                      element={<Suspense fallback={<LoadingSpinner />}><ContentEditor /></Suspense>}
                    />
                    <Route
                      path={`/${type.name}/:id`}
                      element={<Suspense fallback={<LoadingSpinner />}><ContentEditor /></Suspense>}
                    />
                  </Fragment>
                ))}
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
