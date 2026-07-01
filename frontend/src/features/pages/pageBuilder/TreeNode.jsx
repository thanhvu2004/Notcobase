export default function TreeNode({ node, selectedNodeId, onSelect }) {
  return (
    <div className="page-tree-node">
      <button type="button" className={selectedNodeId === node.id ? 'active' : 'secondary'} onClick={() => onSelect(node.id)}>
        {node.title || node.name}
        <small>{node['x-component']}</small>
      </button>
      {Object.values(node.properties || {}).length > 0 && (
        <div className="page-tree-children">
          {Object.values(node.properties).map((child) => (
            <TreeNode key={child.id} node={child} selectedNodeId={selectedNodeId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
