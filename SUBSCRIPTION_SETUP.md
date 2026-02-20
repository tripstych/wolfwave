# Customer Subscription Setup Guide

Your WebWolf CMS comes with a complete subscription system already built-in! Here's how to enable it:

## 🚀 Quick Setup

### 1. Configure Stripe

1. **Get Stripe API Keys**
   - Sign up at [stripe.com](https://stripe.com)
   - Go to Dashboard → Developers → API keys
   - Copy your test keys (or live keys for production)

2. **Add Stripe Keys to Settings**
   - Login to your WebWolf admin panel
   - Go to Settings → Site Settings
   - Add these settings:
     - `stripe_secret_key`: Your Stripe secret key (sk_test_...)
     - `stripe_publishable_key`: Your Stripe publishable key (pk_test_...)
     - `stripe_webhook_secret`: Your webhook secret (whsec_...)
     - `site_url`: Your website URL (e.g., https://yoursite.com)

### 2. Create Subscription Plans

1. **Go to Subscription Management**
   - In admin panel, navigate to "Subscription Plans"
   - Click "New Plan"

2. **Configure Your Plans**
   - **Plan Name**: "Basic", "Pro", "Premium" etc.
   - **Slug**: URL-friendly identifier (basic, pro, premium)
   - **Price**: Monthly/yearly pricing
   - **Trial Days**: Free trial period (optional)
   - **Features**: List what's included (shown on pricing page)

3. **Example Plans**
   ```
   Basic Plan - $9.99/month
   - Access to basic content
   - Monthly newsletter
   
   Pro Plan - $19.99/month  
   - All Basic features
   - Premium content access
   - Video tutorials
   
   Premium Plan - $49.99/month
   - All Pro features
   - 1-on-1 support
   - Exclusive resources
   ```

### 3. Set Up Stripe Webhooks

1. **Create Webhook Endpoint**
   - In Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://yoursite.com/api/webhooks/stripe`
   - Select events: `customer.subscription.*`, `invoice.*`, `payment_intent.*`

2. **Copy Webhook Secret**
   - Stripe will give you a signing secret (whsec_...)
   - Add this to your settings as `stripe_webhook_secret`

## 🎯 How It Works

### Customer Experience

1. **Browse Plans** - Customers visit `/subscribe` to see pricing
2. **Sign Up/Login** - Create account or login to subscribe
3. **Payment** - Redirected to Stripe secure checkout
4. **Access** - Immediate access to subscription content
5. **Management** - Manage subscription at `/account/subscription`

### Content Gating

1. **Subscription-Only Pages**
   - In page editor, set "Subscription Only" = true
   - Only subscribers can view these pages

2. **Subscription-Only Products**
   - In product editor, set "Subscription Only" = true  
   - Only subscribers can purchase these products

3. **Template Variables**
   - Use `{% if customer.subscription %}` in templates
   - Show/hide content based on subscription status

## 🛠 Advanced Features

### Subscription Management
Customers can:
- View current plan and billing dates
- Change plans (prorated upgrades/downgrades)
- Pause/resume subscriptions
- Cancel subscriptions
- Update payment methods

### Admin Features
- View subscriber counts per plan
- Monitor subscription revenue
- Manage customer subscriptions
- Export subscriber data

### Trial Periods
- Offer free trials (e.g., 14 days)
- Automatic conversion to paid subscription
- Trial cancellation handling

## 📝 Testing Checklist

- [ ] Stripe keys configured in settings
- [ ] Webhook endpoint created in Stripe
- [ ] At least one subscription plan created
- [ ] Test customer signup flow
- [ ] Test payment processing
- [ ] Verify content gating works
- [ ] Test subscription management

## 🔧 Troubleshooting

### "Stripe not configured" error
- Check that `stripe_secret_key` is in settings table
- Verify the key starts with `sk_test_` or `sk_live_`

### Plans not showing up
- Ensure plans have `is_active = true`
- Check that plans have `stripe_price_id` (auto-synced)

### Webhook failures
- Verify webhook URL is accessible
- Check webhook secret matches Stripe
- Review Stripe webhook delivery logs

## 📚 API Endpoints

### Customer Subscription API
- `GET /api/customer-subscriptions/me` - Get current subscription
- `POST /api/customer-subscriptions/checkout` - Start checkout
- `POST /api/customer-subscriptions/cancel` - Cancel subscription
- `POST /api/customer-subscriptions/change-plan` - Switch plans

### Plan Management API  
- `GET /api/subscription-plans` - List all plans
- `POST /api/subscription-plans` - Create new plan
- `PUT /api/subscription-plans/:id` - Update plan
- `DELETE /api/subscription-plans/:id` - Deactivate plan

## 🎨 Customization

### Template Customization
- Edit `templates/customer/subscribe.njk` for pricing page
- Edit `templates/customer/subscription.njk` for management page
- Add subscription variables to any template

### CSS Styling
- Pricing page styles are in the template files
- Responsive design included
- Easy to customize with your brand colors

---

That's it! Your subscription system is ready to use. The infrastructure is all there - you just need to configure Stripe and create your plans.
