import React from 'react';
import { Lock, Shield } from 'lucide-react';

export default function AccessControlSection({ 
  accessRules = { auth: 'any', subscription: 'any', plans: [] }, 
  subscriptionPlans = [], 
  onChange 
}) {
  const handleRuleChange = (field, value) => {
    const newRules = { ...accessRules, [field]: value };
    
    // Reset plans if subscription is set to 'any'
    if (field === 'subscription' && value === 'any') {
      newRules.plans = [];
    }
    
    onChange(newRules);
  };

  const handlePlanToggle = (planSlug) => {
    const currentPlans = accessRules.plans || [];
    const newPlans = currentPlans.includes(planSlug)
      ? currentPlans.filter(s => s !== planSlug)
      : [...currentPlans, planSlug];
    
    handleRuleChange('plans', newPlans);
  };

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
        <Lock className="w-4 h-4" />
        Access Control
      </h2>
      <div className="space-y-4">
        <div>
          <label className="label text-sm">Authentication</label>
          <select
            value={accessRules.auth || 'any'}
            onChange={(e) => handleRuleChange('auth', e.target.value)}
            className="input"
          >
            <option value="any">Everyone</option>
            <option value="logged_in">Logged In Only</option>
            <option value="logged_out">Logged Out Only</option>
          </select>
        </div>
        <div>
          <label className="label text-sm">Subscription</label>
          <select
            value={accessRules.subscription || 'any'}
            onChange={(e) => handleRuleChange('subscription', e.target.value)}
            className="input"
          >
            <option value="any">No Subscription Required</option>
            <option value="required">Active Subscription Required</option>
          </select>
        </div>

        {accessRules.subscription === 'required' && (
          <div className="space-y-2">
            <label className="label text-xs">Required Tiers (Optional)</label>
            <div className="space-y-1 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-md">
              {subscriptionPlans.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No plans defined</p>
              ) : (
                subscriptionPlans.map(plan => (
                  <label key={plan.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={(accessRules.plans || []).includes(plan.slug)}
                      onChange={() => handlePlanToggle(plan.slug)}
                    />
                    {plan.name}
                  </label>
                ))
              )}
            </div>
            <p className="text-[10px] text-gray-500">If no tiers are selected, any active subscription will grant access.</p>
          </div>
        )}

        {accessRules.subscription === 'required' && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <p className="flex items-start gap-2">
              <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
              Users without an active subscription will be redirected to the pricing page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
