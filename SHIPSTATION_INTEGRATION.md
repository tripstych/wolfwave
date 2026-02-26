# ShipStation Integration for WolfWave

This module provides native ShipStation integration for WolfWave, mimicking the behavior of the official WooCommerce ShipStation plugin.

## Features

- **Direct XML Export**: Orders are exported in ShipStation's expected XML format
- **Date Range Queries**: ShipStation can poll for orders modified within specific date ranges
- **Pagination**: Handles large order volumes with automatic pagination (100 orders per page)
- **Ship Notifications**: Receives tracking updates from ShipStation (webhook)
- **Authentication**: Secure auth_key based authentication

## Setup

### 1. Set Authentication Key

Add to your `.env` file:

```bash
SHIPSTATION_AUTH_KEY=your-secure-random-key-here
```

Generate a secure key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configure ShipStation

In ShipStation, add a new store:

1. Go to **Settings** → **Stores** → **Add Store**
2. Select **Custom Store**
3. Enter the following:
   - **Store Name**: Your WolfWave Store
   - **Username**: (leave blank)
   - **Password**: (leave blank)
   - **URL**: `https://yourdomain.com/wc-api/v3/?action=export&auth_key=YOUR_AUTH_KEY`
   - **Ship Notification URL**: `https://yourdomain.com/wc-api/v3/?action=shipnotify&auth_key=YOUR_AUTH_KEY`

Replace `YOUR_AUTH_KEY` with the value from your `.env` file.

## API Endpoints

### Export Orders (GET)

**Endpoint**: `/wc-api/v3/?action=export&auth_key=XXX&start_date=...&end_date=...&page=1`

**Parameters**:
- `action=export` - Required
- `auth_key` - Your authentication key
- `start_date` - Start date in ShipStation format (PST/PDT timezone)
- `end_date` - End date in ShipStation format (PST/PDT timezone)
- `page` - Page number (optional, default: 1)

**Response**: XML document containing orders

**Example**:
```bash
curl "https://yourdomain.com/wc-api/v3/?action=export&auth_key=YOUR_KEY&start_date=01012024&end_date=02012024"
```

### Ship Notification (POST)

**Endpoint**: `/wc-api/v3/?action=shipnotify&auth_key=XXX`

**Parameters**:
- `action=shipnotify` - Required
- `auth_key` - Your authentication key

**Body**: XML with tracking information from ShipStation

ShipStation automatically sends tracking updates to this endpoint when orders are shipped.

## XML Format

Orders are exported in the following XML structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Orders page="1" pages="5">
  <Order>
    <OrderNumber><![CDATA[1001]]></OrderNumber>
    <OrderID>1001</OrderID>
    <OrderDate>01/15/2024 10:30</OrderDate>
    <OrderStatus><![CDATA[processing]]></OrderStatus>
    <PaymentMethod><![CDATA[stripe]]></PaymentMethod>
    <CurrencyCode>USD</CurrencyCode>
    <OrderTotal>99.99</OrderTotal>
    <TaxAmount>8.50</TaxAmount>
    <ShippingAmount>5.00</ShippingAmount>
    <Customer>
      <CustomerCode><![CDATA[customer@example.com]]></CustomerCode>
      <BillTo>
        <Name><![CDATA[John Doe]]></Name>
        <Email><![CDATA[customer@example.com]]></Email>
        ...
      </BillTo>
      <ShipTo>
        <Name><![CDATA[John Doe]]></Name>
        <Address1><![CDATA[123 Main St]]></Address1>
        <City><![CDATA[San Francisco]]></City>
        <State><![CDATA[CA]]></State>
        <PostalCode><![CDATA[94102]]></PostalCode>
        <Country><![CDATA[US]]></Country>
        ...
      </ShipTo>
    </Customer>
    <Items>
      <Item>
        <LineItemID>5001</LineItemID>
        <SKU><![CDATA[PROD-001]]></SKU>
        <Name><![CDATA[Product Name]]></Name>
        <Quantity>2</Quantity>
        <UnitPrice>45.00</UnitPrice>
        <Weight>1.5</Weight>
        <WeightUnits>Pounds</WeightUnits>
      </Item>
    </Items>
  </Order>
</Orders>
```

## Order Status Mapping

The following WolfWave order statuses are exported to ShipStation:

- `pending` → Awaiting Payment
- `processing` → Awaiting Shipment
- `on-hold` → On Hold
- `completed` → Shipped

Orders with status `cancelled`, `refunded`, or `failed` are not exported.

## Date Handling

ShipStation uses **PST/PDT timezone** for all dates. The integration automatically converts dates between UTC (database) and PST/PDT (ShipStation).

## Pagination

Orders are exported in batches of 100 per page. The XML response includes pagination metadata:

```xml
<Orders page="1" pages="5">
```

ShipStation automatically requests subsequent pages until all orders are retrieved.

## Logging

All ShipStation API requests are logged:

```
ShipStation: Exported 100 orders (page 1/5)
ShipStation shipnotify received: <XML data>
```

Check server logs for debugging:
```bash
pm2 logs wolfwave
```

## Troubleshooting

### Authentication Errors

**Error**: `Invalid authentication key`

**Solution**: Verify the `auth_key` in the URL matches `SHIPSTATION_AUTH_KEY` in your `.env` file.

### No Orders Exported

**Error**: Empty XML response or `<Orders page="1" pages="0"></Orders>`

**Solution**: 
- Check that orders exist in the date range
- Verify order statuses are `pending`, `processing`, `on-hold`, or `completed`
- Check that `updated_at` timestamps are within the requested range

### Date Format Errors

**Error**: `Invalid date format`

**Solution**: Ensure dates are in ShipStation's expected format. ShipStation typically sends dates like:
- Compact: `01152024x1030` (MMDDYYYYxHHMM)
- Standard: `01/15/2024 10:30`

## Comparison with WooCommerce Plugin

This implementation provides the same core functionality as the official WooCommerce ShipStation plugin:

| Feature | WooCommerce Plugin | WolfWave Module |
|---------|-------------------|-----------------|
| XML Export | ✅ | ✅ |
| Date Range Queries | ✅ | ✅ |
| Pagination | ✅ | ✅ |
| Ship Notifications | ✅ | ✅ |
| Auth Key Security | ✅ | ✅ |
| Order Status Mapping | ✅ | ✅ |
| Custom Fields | ✅ | ⚠️ (TODO) |
| Gift Messages | ✅ | ⚠️ (TODO) |
| Cost of Goods | ✅ | ⚠️ (TODO) |

## Future Enhancements

- [ ] Parse and process ship notification XML to update order tracking
- [ ] Support custom field mapping
- [ ] Add gift message support
- [ ] Implement cost of goods tracking
- [ ] Add webhook for real-time order updates to ShipStation
- [ ] Support for multiple warehouses/locations

## Security Notes

- **Never commit** your `SHIPSTATION_AUTH_KEY` to version control
- Use a strong, randomly generated key (minimum 32 characters)
- Consider rotating the key periodically
- Monitor logs for unauthorized access attempts
- Use HTTPS in production (required by ShipStation)

## Support

For issues or questions:
1. Check server logs: `pm2 logs wolfwave --lines 100`
2. Verify database connectivity
3. Test the endpoint manually with curl
4. Review ShipStation's API documentation: https://www.shipstation.com/docs/api/

## License

Same as WolfWave CMS
