// 本地方案试算。不得当作已上线的应付账本；不连接网站、不结算、不支付。
// 金额使用整数分，比例使用基点；计佣来源必须由权威账本核验。
function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name}必须是非负安全整数`);
  return value;
}

export function multiplyRate(cents, basisPoints) {
  integer(cents, '金额');
  integer(basisPoints, '比例');
  if (basisPoints > 10000) throw new RangeError('比例不得超过100%');
  return Number((BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n);
}

export function allocateCommission({
  netCommissionCents,
  sellerPartnerId = null,
  buyerPartnerId = null,
  dualAttributionApproved = false,
  samePartnerDualRoleApproved = false
}) {
  integer(netCommissionCents, '平台净佣金');
  if (typeof dualAttributionApproved !== 'boolean' || typeof samePartnerDualRoleApproved !== 'boolean') {
    throw new TypeError('叠加决策必须为布尔值');
  }
  for (const id of [sellerPartnerId, buyerPartnerId]) {
    if (id !== null && (typeof id !== 'string' || !id.trim())) throw new TypeError('合伙人ID必须为非空字符串或null');
  }
  if (sellerPartnerId && buyerPartnerId && !dualAttributionApproved) {
    throw new Error('卖买双方同时计提尚未确认，请显式指定试算假设');
  }
  if (sellerPartnerId && sellerPartnerId === buyerPartnerId && !samePartnerDualRoleApproved) {
    throw new Error('同一合伙人兼任买卖双方的叠加规则尚未确认');
  }
  const items = [];
  if (sellerPartnerId) items.push({role: 'seller_developer', partnerId: sellerPartnerId, rateBps: 2000, amountCents: multiplyRate(netCommissionCents, 2000)});
  if (buyerPartnerId) items.push({role: 'buyer_developer', partnerId: buyerPartnerId, rateBps: 3000, amountCents: multiplyRate(netCommissionCents, 3000)});
  const partnerTotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  return {
    draftOnly: true,
    netCommissionCents,
    items,
    partnerTotalCents,
    teamRewardStatus: '待定，未计提',
    platformRemainingBeforeTeamAndCostsCents: netCommissionCents - partnerTotalCents
  };
}

// 只展示奖励门槛。返回达到条件的累计金额，不代表本次可支付金额。
// 持久化计奖、唯一键、规则快照、历史已支付金额与退款调整需由正式账本实现。
export function developmentEligibility({
  role,
  registrationVerified = false,
  qualificationApproved = false,
  publishedSkuCount = 0,
  buyerType = 'independent',
  verifiedKaStoreCount = 0,
  kaAwardUnit = null,
  firstOrderCompleted = false,
  firstOrderNetGoodsCents = 0
}) {
  if (!['seller', 'buyer'].includes(role)) throw new TypeError('未知客户角色');
  for (const [name, value] of Object.entries({registrationVerified, qualificationApproved, firstOrderCompleted})) {
    if (typeof value !== 'boolean') throw new TypeError(`${name}必须为布尔值`);
  }
  integer(publishedSkuCount, 'SKU数');
  integer(verifiedKaStoreCount, '已核验KA门店数');
  integer(firstOrderNetGoodsCents, '首单净商品额');
  const assumptions = ['仅单笔已完成订单，商品净额已扣退款且不含运费', '输出为累计达标金额，未扣除历史已计提/已支付奖励'];
  let onboardingEligible, thresholdCents, onboardingCents, firstTradeCents;
  if (role === 'seller') {
    onboardingEligible = registrationVerified && qualificationApproved && publishedSkuCount >= 10;
    thresholdCents = 100000; onboardingCents = 10000; firstTradeCents = 20000;
    assumptions.push('建议口径：建店奖也要求资质通过且有效SKU≥10；该口径待确认');
  } else {
    if (!['independent', 'ka'].includes(buyerType)) throw new TypeError('未知买家类型');
    if (buyerType === 'ka' && !['headquarters', 'store'].includes(kaAwardUnit)) {
      throw new Error('KA计奖单位未确认，请显式选择总部或门店作为试算假设');
    }
    onboardingEligible = registrationVerified && (buyerType !== 'ka' || verifiedKaStoreCount >= 30);
    thresholdCents = buyerType === 'ka' ? 100000 : 50000;
    onboardingCents = buyerType === 'ka' ? 5000 : 3000;
    firstTradeCents = buyerType === 'ka' ? 5000 : 2000;
    if (buyerType === 'ka') assumptions.push(`本次仅试算一个${kaAwardUnit === 'store' ? '门店' : '总部'}计奖单位，单位选择待确认`);
  }
  const tradeEligible = onboardingEligible && firstOrderCompleted && firstOrderNetGoodsCents >= thresholdCents;
  return {
    draftOnly: true, assumptions,
    milestones: [
      {stage: 'onboarding', eligible: onboardingEligible, cumulativeAwardCents: onboardingEligible ? onboardingCents : 0},
      {stage: 'first_trade', eligible: tradeEligible, cumulativeAwardCents: tradeEligible ? firstTradeCents : 0}
    ],
    totalEligibleCents: (onboardingEligible ? onboardingCents : 0) + (tradeEligible ? firstTradeCents : 0)
  };
}

// 同一订单、同一归属和同一规则快照下，退款前后累计权益差额。
// 部分退款须先从原平台佣金账本取得冲减后的净佣金，不能用退款GMV替代。
export function allocationDelta(previous, next) {
  function aggregate(allocation) {
    if (allocation?.draftOnly !== true || !Array.isArray(allocation.items)) throw new TypeError('需要本模块的试算结果');
    const map = new Map();
    for (const item of allocation.items) {
      integer(item.amountCents, '权益金额');
      const key = JSON.stringify([item.partnerId, item.role]);
      map.set(key, (map.get(key) ?? 0) + item.amountCents);
    }
    return map;
  }
  const before = aggregate(previous), after = aggregate(next);
  return [...new Set([...before.keys(), ...after.keys()])].map(key => {
    const [partnerId, role] = JSON.parse(key);
    return {partnerId, role, adjustmentCents: (after.get(key) ?? 0) - (before.get(key) ?? 0)};
  });
}
