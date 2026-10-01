import type { Metadata } from 'next';

import { CentralPage } from '@/components/central/CentralPage';

export const metadata: Metadata = {
  title: 'ภาพรวมสถานการณ์น้ำ',
  description:
    'ระดับน้ำและปริมาณน้ำในเขื่อนของลุ่มน้ำสายหลัก ตั้งแต่ภาคเหนือ ภาคกลาง ถึงภาคตะวันออก จาก ThaiWater (สสน.) และกรมชลประทาน',
};

export default function Page() {
  return <CentralPage />;
}
