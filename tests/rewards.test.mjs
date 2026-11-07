import test from 'node:test';
import assert from 'node:assert/strict';
import {multiplyRate, allocateCommission, developmentEligibility, allocationDelta} from '../src/rewards.mjs';

const both = {sellerPartnerId:'seller-partner', buyerPartnerId:'buyer-partner', dualAttributionApproved:true};
const seller = {role:'seller', registrationVerified:true, qualificationApproved:true, publishedSkuCount:10, firstOrderCompleted:true, firstOrderNetGoodsCents:100000};

test('1万元药品订单的300元实际佣金，双边分别60元和90元', () => {
  const r = allocateCommission({...both, netCommissionCents:30000});
  assert.deepEqual(r.items.map(x=>x.amountCents),[6000,9000]);
  assert.equal(r.platformRemainingBeforeTeamAndCostsCents,15000);
});
test('按真实佣金而非目标3%推算：实际佣金60元则双边12元、18元', () => {
  const r = allocateCommission({...both, netCommissionCents:6000});
  assert.deepEqual(r.items.map(x=>x.amountCents),[1200,1800]);
});
test('混合订单先按每行佣金事实分配，3%和6%不互相覆盖', () => {
  const lines = [allocateCommission({...both,netCommissionCents:18000}), allocateCommission({...both,netCommissionCents:24000})];
  assert.equal(lines.reduce((s,x)=>s+x.partnerTotalCents,0),21000);
});
test('双边叠加没有显式决策时拒绝试算', () => {
  assert.throws(()=>allocateCommission({...both,dualAttributionApproved:false,netCommissionCents:30000}),/尚未确认/);
});
test('同一人兼任双边需要独立显式决策', () => {
  assert.throws(()=>allocateCommission({...both,buyerPartnerId:'seller-partner',netCommissionCents:30000}),/兼任/);
});
test('没有归属的奖励不补发给另一方，团队奖保持待定', () => {
  const r=allocateCommission({sellerPartnerId:'s',netCommissionCents:30000});
  assert.equal(r.partnerTotalCents,6000);
  assert.equal(r.platformRemainingBeforeTeamAndCostsCents,24000);
  assert.equal(r.teamRewardStatus,'待定，未计提');
});
test('部分退款按净佣金差额冲回', () => {
  const delta=allocationDelta(allocateCommission({...both,netCommissionCents:30000}),allocateCommission({...both,netCommissionCents:18000}));
  assert.deepEqual(delta.map(x=>x.adjustmentCents),[-2400,-3600]);
});
test('整单退款完全冲回每个受益人的累计权益', () => {
  const delta=allocationDelta(allocateCommission({...both,netCommissionCents:30001}),allocateCommission({...both,netCommissionCents:0}));
  assert.deepEqual(delta.map(x=>x.adjustmentCents),[-6000,-9000]);
});
test('分级计算采用整数分和四舍五入', () => {
  assert.equal(multiplyRate(5,3000),2);
  assert.equal(multiplyRate(1,3000),0);
  assert.throws(()=>multiplyRate(1.5,3000));
  assert.throws(()=>multiplyRate(100,10001));
});
test('异常金额、角色和ID被拒绝', () => {
  for(const n of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>allocateCommission({netCommissionCents:n}));
  assert.throws(()=>allocateCommission({netCommissionCents:100,sellerPartnerId:42}));
  assert.throws(()=>developmentEligibility({role:'other'}));
  assert.throws(()=>developmentEligibility({...seller,firstOrderCompleted:'false'}));
});
test('卖家10个SKU且首单1000元，累计开发奖300元', () => {
  assert.equal(developmentEligibility(seller).totalEligibleCents,30000);
});
test('卖家首单999.99元，仅累计建店奖100元', () => {
  assert.equal(developmentEligibility({...seller,firstOrderNetGoodsCents:99999}).totalEligibleCents,10000);
});
test('卖家SKU不足或资质未通过，不达到建议建店门槛', () => {
  assert.equal(developmentEligibility({...seller,publishedSkuCount:9}).totalEligibleCents,0);
  assert.equal(developmentEligibility({...seller,qualificationApproved:false}).totalEligibleCents,0);
});
test('单体买家首单500元时累计50元，未完成订单仅30元', () => {
  const b={role:'buyer',registrationVerified:true,firstOrderCompleted:true,firstOrderNetGoodsCents:50000};
  assert.equal(developmentEligibility(b).totalEligibleCents,5000);
  assert.equal(developmentEligibility({...b,firstOrderCompleted:false}).totalEligibleCents,3000);
  assert.equal(developmentEligibility({...b,firstOrderNetGoodsCents:49999}).totalEligibleCents,3000);
});
test('KA单位未确认时不默认按30家乘奖；30店是类型门槛', () => {
  const b={role:'buyer',buyerType:'ka',registrationVerified:true,verifiedKaStoreCount:30,firstOrderCompleted:true,firstOrderNetGoodsCents:100000};
  assert.throws(()=>developmentEligibility(b),/KA计奖单位/);
  assert.equal(developmentEligibility({...b,kaAwardUnit:'headquarters'}).totalEligibleCents,10000);
  assert.equal(developmentEligibility({...b,kaAwardUnit:'store'}).totalEligibleCents,10000);
  assert.equal(developmentEligibility({...b,kaAwardUnit:'headquarters',verifiedKaStoreCount:29}).totalEligibleCents,0);
});
test('极小金额和部分退款仍按累计权益差额冲回，无重复取整残留', () => {
  const start=allocateCommission({...both,netCommissionCents:5});
  const middle=allocateCommission({...both,netCommissionCents:3});
  const end=allocateCommission({...both,netCommissionCents:0});
  const deltas=[allocationDelta(start,middle),allocationDelta(middle,end)];
  assert.equal(start.partnerTotalCents + deltas.flat().reduce((s,x)=>s+x.adjustmentCents,0),0);
});
