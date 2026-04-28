const bcrypt = require('bcryptjs');

const users = [
  { u: 'admin', p: '0000', h: '$2a$12$Wz2r83UWxWFI73Q4akLpKeMHfTgn.zXzh/u/yOI.bS6Yjn1unOlIK' },
  { u: 'manager', p: '1234', h: '$2a$12$.EPg1PxxsbWnxv1iYAOJm.Wbd0tZhcuA2jMAb319tkr6IQ7Xp8UMq' },
  { u: 'user', p: '1111', h: '$2a$12$VdbmpNAJRjkWEYeMGTS.d.XAoZXSmEZQW/rfWJ0sb1Aml44dnBOHO' }
];

async function test() {
    for (const user of users) {
        const match = await bcrypt.compare(user.p, user.h);
        console.log(`User: ${user.u}, PIN: ${user.p}, Match: ${match}`);
    }
}

test();
