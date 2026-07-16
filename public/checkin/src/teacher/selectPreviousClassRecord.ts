export function selectPreviousClassRecord(records: any[], currentRecord: any) {
  const currentClassBtime = currentRecord?.classBtime || 0;

  return (records || [])
    .slice()
    .sort((a, b) => (b.classBtime || 0) - (a.classBtime || 0))
    .filter((record) => record.classId !== currentRecord?.classId)
    .filter((record) => (record.classBtime || 0) < currentClassBtime)
    .slice(0, 1);
}
