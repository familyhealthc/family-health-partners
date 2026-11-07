import {allocateCommission, developmentEligibility, allocationDelta, multiplyRate} from '../src/rewards.mjs';
const attribution={sellerPartnerId:'示例卖家开发方',buyerPartnerId:'示例买家开发方',dualAttributionApproved:true};
const drug=allocateCommission({...attribution,netCommissionCents:30000});
const afterRefund=allocateCommission({...attribution,netCommissionCents:18000});
const firstOrderCommission=3000;
const firstOrderSplit=allocateCommission({...attribution,netCommissionCents:firstOrderCommission});
const hypotheticalTeamRewardCents=multiplyRate(firstOrderCommission,1000);
console.log(JSON.stringify({
  status:'纯本地方案试算，非网站实际数据、非可付款凭证',
  assumptions:['示例明确假设买卖双方可以同时获奖，尚待商业决策确认','团队10%仅用于成本敏感性演示，未加入规则引擎','卖家建店奖按资质通过且有效SKU≥10的建议口径'],
  tenThousandYuanDrugOrderAtThreePercent:drug,
  tenThousandYuanNonDrugOrderAtSixPercent:allocateCommission({...attribution,netCommissionCents:60000}),
  sameOrderWithActualCommissionAtPointSixPercent:allocateCommission({...attribution,netCommissionCents:6000}),
  fortyPercentCommissionReversal:{remaining:afterRefund,adjustments:allocationDelta(drug,afterRefund)},
  sellerDevelopment:developmentEligibility({role:'seller',registrationVerified:true,qualificationApproved:true,publishedSkuCount:10,firstOrderCompleted:true,firstOrderNetGoodsCents:100000}),
  independentBuyerDevelopment:developmentEligibility({role:'buyer',registrationVerified:true,firstOrderCompleted:true,firstOrderNetGoodsCents:50000}),
  oneThousandYuanFirstOrderEconomics:{
    goodsNetCents:100000,platformCommissionCents:firstOrderCommission,
    sellerShareCents:600,buyerShareCents:900,hypotheticalTeamRewardCents,
    remainingBeforeDevelopmentRewardsAndCostsCents:firstOrderSplit.platformRemainingBeforeTeamAndCostsCents-hypotheticalTeamRewardCents,
    sellerDevelopmentRewardCents:30000,independentBuyerDevelopmentRewardCents:5000,
    remainingAfterDevelopmentRewardsBeforeOtherCostsCents:firstOrderSplit.platformRemainingBeforeTeamAndCostsCents-hypotheticalTeamRewardCents-35000,
    note:'假设这一笔同时触发卖家完整开发奖和单体买家完整开发奖；未计支付费、税费和运营成本。开发奖应计入获客预算，并测算后续复购回收。'
  }
},null,2));
