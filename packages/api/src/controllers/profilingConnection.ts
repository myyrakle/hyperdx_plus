import ProfilingConnection, {
  IProfilingConnection,
} from '@/models/profilingConnection';

export function getProfilingConnectionsByTeam(team: string) {
  return ProfilingConnection.find({ team });
}

export function getProfilingConnectionById(
  team: string,
  connectionId: string,
  selectSecret = false,
) {
  return ProfilingConnection.findOne({ _id: connectionId, team }).select(
    selectSecret ? '+secret' : '',
  );
}

export function createProfilingConnection(
  team: string,
  connection: Omit<IProfilingConnection, '_id' | 'team'>,
) {
  return ProfilingConnection.create({ ...connection, team });
}

export function updateProfilingConnection(
  team: string,
  connectionId: string,
  connection: Partial<Omit<IProfilingConnection, '_id' | 'team'>>,
  unsetFields: string[] = [],
) {
  const updateOperation: Record<string, unknown> = { $set: connection };
  if (unsetFields.length > 0) {
    updateOperation.$unset = Object.fromEntries(
      unsetFields.map(field => [field, '']),
    );
  }
  return ProfilingConnection.findOneAndUpdate(
    { _id: connectionId, team },
    updateOperation,
    { new: true },
  );
}

export function deleteProfilingConnection(team: string, connectionId: string) {
  return ProfilingConnection.findOneAndDelete({ _id: connectionId, team });
}
