import { Fragment, useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, lazy } from 'react-router-dom';
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
const ThemeEditor = lazy(() => import('./settings/ThemeEditor'));
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
                <Route path="/pages" element={<Pages />} />
                <Route path="/pages/new" element={<PageEditor />} />
                <Route path="/pages/:id" element={<PageEditor />} />
                <Route path="/posts" element={<Posts />} />
                <Route path="/posts/new" element={<PostEditor />} />
                <Route path="/posts/:id" element={<PostEditor />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/media" element={<Media />} />
                <Route path="/menus" element={<Menus />} />
                <Route path="/blocks" element={<Blocks />} />
                <Route path="/blocks/new" element={<BlockEditor />} />
                <Route path="/blocks/:id" element={<BlockEditor />} />
                <Route path="/widgets" element={<Widgets />} />
                <Route path="/widgets/new" element={<WidgetEditor />} />
                <Route path="/widgets/:id" element={<WidgetEditor />} />
                <Route path="/seo" element={<SEO />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/import" element={<SiteImporter />} />
                <Route path="/assisted-import" element={<AssistedImporter />} />
                <Route path="/import-lovable" element={<LovableImporter />} />
                <Route path="/products" element={<ProductList />} />
                <Route path="/products/new" element={<ProductEditor />} />
                <Route path="/products/:id" element={<ProductEditor />} />
                <Route path="/orders" element={<OrderList />} />
                <Route path="/orders/:id" element={<OrderDetail />} />
                <Route path="/shipstation" element={<ShipStation />} />
                <Route path="/groups" element={<GroupList />} />
                <Route path="/groups/new" element={<GroupEditor />} />
                <Route path="/groups/:id" element={<GroupEditor />} />
                <Route path="/users" element={<UserList />} />
                <Route path="/users/new" element={<UserEditor />} />
                <Route path="/users/:id" element={<UserEditor />} />
                <Route path="/customers" element={<CustomerList />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/subscriptions" element={<PlanList />} />
                <Route path="/subscriptions/new" element={<PlanEditor />} />
                <Route path="/subscriptions/:id" element={<PlanEditor />} />
                <Route path="/marketing/coupons" element={<CouponList />} />
                <Route path="/marketing/coupons/new" element={<CouponEditor />} />
                <Route path="/marketing/coupons/:id" element={<CouponEditor />} />
                <Route path="/sites" element={<Sites />} />
                <Route path="/my-sites" element={<MySites />} />
                <Route path="/themes" element={<Themes />} />
                <Route path="/themes/import" element={<WpThemeImport />} />
                <Route path="/themes/:themeName/editor" element={<ThemeEditor />} />
                <Route path="/styles" element={<StyleEditor />} />
                <Route path="/email-templates" element={<EmailTemplates />} />
                <Route path="/api-keys" element={<ApiKeys />} />
                <Route path="/woocommerce-keys" element={<WooCommerceKeys />} />
                <Route path="/classifieds" element={<ClassifiedList />} />
                <Route path="/classifieds/settings" element={<ClassifiedSettings />} />
                <Route path="/classifieds/my-ads" element={<MyClassifieds />} />
                <Route path="/classifieds/:id" element={<ClassifiedDetail />} />

                {/* Global Admin Only Routes */}
                {user?.is_global && (
                  <Route path="/tenants" element={<TenantList />} />
                )}
                {contentTypes.map(type => (
                  <Fragment key={type.name}>
                    <Route
                      path={`/${type.name}`}
                      element={<ContentList />}
                    />
                    <Route
                      path={`/${type.name}/new`}
                      element={<ContentEditor />}
                    />
                    <Route
                      path={`/${type.name}/:id`}
                      element={<ContentEditor />}
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
