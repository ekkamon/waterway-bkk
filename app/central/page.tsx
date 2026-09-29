import type { Metadata } from "next";

import { CentralPage } from "@/components/central/CentralPage";

export const metadata: Metadata = {
  title: "ภาพรวมน้ำลุ่มเจ้าพระยา · ภาคกลาง",
  description:
    "ระดับน้ำและปริมาณน้ำในเขื่อน จากภาคเหนือลงสู่กรุงเทพฯ นนทบุรี ปทุมธานี และปากแม่น้ำภาคกลาง จาก ThaiWater (สสน.) และกรมชลประทาน",
};

export default function Page() {
  return <CentralPage />;
}
