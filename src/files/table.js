import React from 'react'
import ClassNames from 'classnames'
import { DragSource, DropTarget } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'
import { formatDistanceToNow } from 'date-fns'
import { getDateFnsLocale } from '../i18n'

import BaseFile, { BaseFileConnectors } from './../base-file.js'
import { fileSize } from './utils.js'
import { BROWSER_COLUMNS } from '../browser'

class RawTableFile extends BaseFile {
  render() {
    const {
      isDragging, isDeleting, isRenaming, isOver, isSelected,
      action, url, browserProps, connectDragPreview,
      depth, size, modified, columns, icon, createdAt
    } = this.props

    const fileIcon = icon ?? (browserProps.icons[this.getFileType()] || browserProps.icons.File)
    const inAction = (isDragging || action)

    const ConfirmDeletionRenderer = browserProps.confirmDeletionRenderer

    let name
    if (!inAction && isDeleting && browserProps.selection.length === 1) {
      name = (
        <ConfirmDeletionRenderer
          handleDeleteSubmit={this.handleDeleteSubmit}
          handleFileClick={this.handleFileClick}
          url={url}
        >
          {fileIcon}
          {this.getName()}
        </ConfirmDeletionRenderer>
      )
    } else if (!inAction && isRenaming) {
      name = (
        <form className="renaming" onSubmit={this.handleRenameSubmit}>
          {fileIcon}
          <input
            ref={this.selectFileNameFromRef}
            type="text"
            value={this.state.newName}
            onChange={this.handleNewNameChange}
            onBlur={this.handleCancelEdit}
            autoFocus
          />
        </form>
      )
    } else {
      name = (
        <a
          href={url || '#'}
          download="download"
          onClick={this.handleFileClick}
        >
          {fileIcon}
          {this.getName()}
        </a>
      )
    }

    let draggable = (
      <div>
        {name}
      </div>
    )
    if (typeof browserProps.moveFile === 'function') {
      draggable = connectDragPreview(draggable)
    }

    const row = (
      <tr
        className={ClassNames('file', {
          pending: action,
          dragging: isDragging,
          dragover: isOver,
          selected: isSelected,
        })}
        onClick={this.handleItemClick}
        onDoubleClick={this.handleItemDoubleClick}
      >
        {columns?.includes(BROWSER_COLUMNS.FILE) ? <td className="name">
          <div style={{ paddingLeft: (depth * 16) + 'px' }}>
            {draggable}
          </div>
        </td> : null}
        {columns?.includes(BROWSER_COLUMNS.SIZE) ? <td className="size">{fileSize(size)}</td> : null}
        {columns?.includes(BROWSER_COLUMNS.LAST_MODIFIED)
          ? <td className="modified">
            {typeof modified === 'undefined' ? '-' : formatDistanceToNow(modified, { addSuffix: true, locale: getDateFnsLocale() })}
          </td>
          : null}
        {columns?.includes(BROWSER_COLUMNS.CREATED_AT)
          ? <td className="createdAt">
            {typeof createdAt === 'undefined' ? '-' : createdAt}
          </td>
          : null}
      </tr>
    )

    return this.connectDND(row)
  }
}

@DragSource('file', BaseFileConnectors.dragSource, BaseFileConnectors.dragCollect)
@DropTarget(
  ['file', 'folder', NativeTypes.FILE],
  BaseFileConnectors.targetSource,
  BaseFileConnectors.targetCollect
)
class TableFile extends RawTableFile {}

export default TableFile
export { RawTableFile }
