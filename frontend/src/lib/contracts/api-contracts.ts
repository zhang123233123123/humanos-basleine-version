export interface ResourceEnvelope<T> {
  data: T
  resources: Record<string, string>
  meta: {
    resource: string
    aggregate_root?: 'profile' | 'task'
    read_only?: boolean
  }
}
