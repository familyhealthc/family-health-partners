export const demoRules={confirmed:true,version:1,sellerSkuGate:true,kaAwardUnit:'headquarters',dualMode:'both',samePartnerDualRole:true,settlementDays:30,teamEnabled:false,plansEnabled:false,promotionEnabled:false,exitEnabled:false};
export const demoPartners=[
  {id:'P001',name:'陈晓 · 示例',region:'杭州 · 西湖',level:'natural',status:'active',joinedAt:'2026-07-01',note:'演示合伙人'},
  {id:'P002',name:'林悦 · 示例',region:'杭州 · 余杭',level:'regional',status:'active',joinedAt:'2026-07-08',note:'演示合伙人'},
  {id:'P003',name:'周宁 · 示例',region:'宁波 · 海曙',level:'natural',status:'trial',joinedAt:'2026-08-15',note:'演示合伙人'}
];
export const demoCustomers=[
  {id:'C001',name:'西溪示例药房',subjectId:'DEMO-SUB-01',role:'buyer',buyerType:'independent',partnerId:'P001',registrationVerified:true,qualificationApproved:true,publishedSkuCount:0,kaStoreCount:0,registeredAt:'2026-08-01',note:'全部为虚构数据'},
  {id:'C002',name:'康和示例医药供应商',subjectId:'DEMO-SUB-02',role:'seller',buyerType:'independent',partnerId:'P002',registrationVerified:true,qualificationApproved:true,publishedSkuCount:28,kaStoreCount:0,registeredAt:'2026-08-02',note:''},
  {id:'C003',name:'城北示例诊所',subjectId:'DEMO-SUB-03',role:'buyer',buyerType:'independent',partnerId:'P003',registrationVerified:true,qualificationApproved:true,publishedSkuCount:0,kaStoreCount:0,registeredAt:'2026-09-03',note:''},
  {id:'C004',name:'安心示例连锁总部',subjectId:'DEMO-SUB-04',role:'buyer',buyerType:'ka',kaGroupId:'DEMO-KA-04',partnerId:'P001',registrationVerified:true,qualificationApproved:true,publishedSkuCount:0,kaStoreCount:36,registeredAt:'2026-08-11',note:'36家门店，演示按总部计奖'},
  {id:'C005',name:'滨江示例药房',subjectId:'DEMO-SUB-05',role:'buyer',buyerType:'independent',partnerId:'P002',registrationVerified:false,qualificationApproved:false,publishedSkuCount:0,kaStoreCount:0,registeredAt:'2026-11-01',note:'待核验注册资料'},
  {id:'C006',name:'新禾示例供应商',subjectId:'DEMO-SUB-06',role:'seller',buyerType:'independent',partnerId:'P003',registrationVerified:true,qualificationApproved:true,publishedSkuCount:8,kaStoreCount:0,registeredAt:'2026-10-25',note:'待补足10个有效SKU'}
];
export const demoOrders=[
  {id:'DEMO-260801',buyerId:'C001',sellerId:'C002',goodsCents:1000000,commissionCents:30000,commissionVerified:true,completedAt:'2026-08-12',status:'completed',category:'RX/OTC'},
  {id:'DEMO-260802',buyerId:'C004',sellerId:'C002',goodsCents:2000000,commissionCents:60000,commissionVerified:true,completedAt:'2026-08-15',status:'completed',category:'RX/OTC'},
  {id:'DEMO-260903',buyerId:'C003',sellerId:'C002',goodsCents:80000,commissionCents:4800,commissionVerified:true,completedAt:'2026-09-08',status:'completed',category:'非药'},
  {id:'DEMO-260904',buyerId:'C001',sellerId:'C002',goodsCents:500000,commissionCents:30000,commissionVerified:true,completedAt:'2026-09-17',status:'completed',category:'非药'},
  {id:'DEMO-261101',buyerId:'C001',sellerId:'C002',goodsCents:150000,commissionCents:4500,commissionVerified:true,completedAt:'2026-11-01',status:'completed',category:'RX/OTC'},
  {id:'DEMO-261102',buyerId:'C003',sellerId:'C006',goodsCents:100000,commissionCents:null,commissionVerified:false,completedAt:'2026-11-02',status:'completed',category:'RX/OTC'}
];
