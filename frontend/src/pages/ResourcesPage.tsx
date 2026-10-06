import { useEffect, useState } from 'react';
import { Building2, Command, Map } from 'lucide-react';
import { api } from '../lib';
import { Panel } from '../components/common';

export function ResourcesPage({ onToast }: { onToast: (x: string) => void }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [campus, setCampus] = useState<any>(null);
  const [equipment, setEquipment] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([
      api<any[]>('/api/v2/resources/rooms'),
      api<any>('/api/v2/resources/campus'),
      api<any[]>('/api/v2/resources/equipment'),
    ])
      .then(([r, c, e]) => {
        setRooms(r);
        setCampus(c);
        setEquipment(e);
      })
      .catch((e) => onToast(e.message));
  }, []);
  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">RESOURCE ORCHESTRATION</span>
          <h1>Campus resources</h1>
          <p>Rooms, equipment and the physical campus model in one workspace.</p>
        </div>
        <div className="heroBadge">
          <Map size={16} />
          Digital campus
        </div>
      </div>
      <div className="grid2">
        <Panel title={`${rooms.length} rooms`} icon={<Building2 size={17} />}>
          <div className="resourceGrid">
            {rooms.map((r) => (
              <div className="resource" key={r.id}>
                <div className="roomIcon">
                  <Building2 size={17} />
                </div>
                <div>
                  <b>{r.code || r.name}</b>
                  <span>
                    {r.capacity} seats · {r.building}
                  </span>
                </div>
                <span className="availability">{r.status}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Campus topology" icon={<Map size={17} />}>
          <div className="tree">
            {campus && (
              <div className="treeRoot">
                <b>{campus.name}</b>
                {campus.buildings?.map((b: any) => (
                  <div className="treeItem" key={b.name}>
                    <Building2 size={15} />
                    {b.name}
                    <span>
                      {b.floors?.reduce((n: number, f: any) => n + (f.rooms?.length || 0), 0)} rooms
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
      <Panel title="Equipment inventory" icon={<Command size={17} />}>
        <div className="equipmentStrip">
          {equipment.map((e) => (
            <div className="equipment" key={e.id}>
              <span className="equipmentDot" />
              <div>
                <b>{e.name}</b>
                <small>
                  {e.typeName} · {e.status}
                </small>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
