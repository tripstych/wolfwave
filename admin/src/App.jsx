import { Fragment, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useContentTypes } from './context/ContentTypesContext';
import Layout from './components/Layout';
import Login from './core/Login';
import Dashboard from './core/Dashboard';
import Pages from './pages/Pages';
import PageEditor from './pages/PageEditor';
import Posts from './pages/Posts';
import PostEditor from './pages/PostEditor';
import Templates from './settings/Templates';
import Media from './settings/Media';
import Menus from './settings/Menus';
import Blocks from './blocks/Blocks';
import BlockEditor from './blocks/BlockEditor';
import Widgets from './widgets/Widgets';
import WidgetEditor from './widgets/WidgetEditor';
import Settings from './settings/Settings';
import SEO from './settings/SEO';
import SiteImporter from './pages/SiteImporter';
import AssistedImporter from './pages/AssistedImporter';
import LovableImporter from './pages/LovableImporter';
import ContentList from './content/ContentList';
import ContentEditor from './content/ContentEditor';
import ProductList from './products/ProductList';
import ProductEditor from './products/ProductEditor';
import OrderList from './orders/OrderList';
import OrderDetail from './orders/OrderDetail';
import GroupList from './groups/GroupList';
import GroupEditor from './groups/GroupEditor';
import UserList from './users/UserList';
import UserEditor from './users/UserEditor';
import CustomerList from './customers/CustomerList';
import CustomerDetail from './customers/CustomerDetail';
import TenantList from './tenants/TenantList';
import Sites from './tenants/Sites';
import MySites from './tenants/MySites';
import Themes from './settings/Themes';
import WpThemeImport from './settings/WpThemeImport';
import ThemeEditor from './settings/ThemeEditor';
import StyleEditor from './settings/StyleEditor';
import EmailTemplates from './settings/EmailTemplates';
import ApiKeys from './settings/ApiKeys';
import WooCommerceKeys from './pages/WooCommerceKeys';
import PlanList from './subscriptions/PlanList';
import PlanEditor from './subscriptions/PlanEditor';
import CouponList from './marketing/CouponList';
import CouponEditor from './marketing/CouponEditor';
import ClassifiedList from './classifieds/ClassifiedList';
import ClassifiedDetail from './classifieds/ClassifiedDetail';
import ClassifiedSettings from './classifieds/ClassifiedSettings';
import MyClassifieds from './classifieds/MyClassifieds';
import ShipStation from './orders/ShipStation';

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
