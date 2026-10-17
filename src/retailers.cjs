const RETAILERS = ['Best Buy US', 'Amazon', 'Target', 'Walmart'];
function normalizeRetailer(value) { return value === 'Best Buy' || value === 'BestBuyUS' ? 'Best Buy US' : value; }
function product(input, selected) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Enter a valid retailer product URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Use an HTTPS product URL without credentials or a custom port.');
  const host = url.hostname.replace(/^www\./, '');
  let retailer;
  if (host === 'target.com' && url.pathname.startsWith('/p/')) retailer = 'Target';
  if (host === 'walmart.com' && url.pathname.startsWith('/ip/')) retailer = 'Walmart';
  if (host === 'amazon.com' && /\/(?:dp|gp\/product)\/[a-z0-9]{10}(?:\/|$)/i.test(url.pathname)) retailer = 'Amazon';
  if (host === 'bestbuy.com' && ((url.pathname.startsWith('/site/') && /\/\d+\.p$/.test(url.pathname)) || url.pathname.startsWith('/product/'))) retailer = 'Best Buy US';
  if (!retailer) throw new Error('Use a US product link from Best Buy, Amazon, Target, or Walmart. Amazon links must include /dp/ASIN or /gp/product/ASIN.');
  if (selected && normalizeRetailer(selected) !== retailer) throw new Error('The product link does not match the selected retailer.');
  return { url: url.href, retailer };
}
module.exports = { RETAILERS, normalizeRetailer, product };
