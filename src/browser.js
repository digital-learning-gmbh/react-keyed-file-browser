import PropTypes from 'prop-types'
import React from 'react'
// i18n
// eslint-disable-next-line import/no-duplicates
import i18n from 'i18next'
// drag and drop
// import HTML5Backend from 'react-dnd-html5-backend'  ->> Imported from props
// import { DragDropContext } from 'react-dnd'
import { DndProvider } from 'react-dnd'
// default components (most overridable)
import { DefaultDetail } from './details'
import { DefaultFilter } from './filters'

// default renderers
import { TableHeader } from './headers'
import { TableFile } from './files'
import { TableFolder } from './folders'
import { DefaultConfirmDeletion, MultipleConfirmDeletion } from './confirmations'

// default processors
import { GroupByFolder } from './groupers'
import { SortByName } from './sorters'

import { isFolder } from './utils'
import { DefaultAction } from './actions'
import { withNamespaces } from 'react-i18next'

const SEARCH_RESULTS_PER_PAGE = 20
const regexForNewFolderOrFileSelection = /.*\/__new__[/]?$/gm

export const BROWSER_COLUMNS =
  {
    FILE: 'file',
    SIZE: 'size',
    LAST_MODIFIED: 'lastModified',
  }

function getItemProps(file, browserProps) {
  return {
    key: `file-${file.key}`,
    fileKey: file.key,
    icon: file.icon, /* Override icon of the item. */
    isSelected: (browserProps.selection.includes(file.key)),
    isOpen: file.key in browserProps.openFolders || browserProps.nameFilter,
    isRenaming: browserProps.activeAction === 'rename' && browserProps.actionTargets.includes(file.key),
    isDeleting: browserProps.activeAction === 'delete' && browserProps.actionTargets.includes(file.key),
    isDraft: !!file.draft,
  }
}

class RawFileBrowser extends React.Component {
  static propTypes = {
    files: PropTypes.arrayOf(PropTypes.shape({
      key: PropTypes.string.isRequired,
      modified: PropTypes.number,
      size: PropTypes.number,
      backend: PropTypes.object,
      icon: PropTypes.element, /* Override icon of the item. */
    })).isRequired,
    locale: PropTypes.string,
    actions: PropTypes.node,
    showActionBar: PropTypes.bool.isRequired,
    canFilter: PropTypes.bool.isRequired,
    showFoldersOnFilter: PropTypes.bool,
    noFilesMessage: PropTypes.string,

    group: PropTypes.func.isRequired,
    sort: PropTypes.func.isRequired,

    icons: PropTypes.shape({
      Folder: PropTypes.element,
      FolderOpen: PropTypes.element,
      File: PropTypes.element,
      PDF: PropTypes.element,
      Image: PropTypes.element,
      Delete: PropTypes.element,
      Rename: PropTypes.element,
      Loading: PropTypes.element,
      Download: PropTypes.element,
    }),

    columns: PropTypes.array,

    nestChildren: PropTypes.bool.isRequired,
    renderStyle: PropTypes.oneOf([
      'list',
      'table',
    ]).isRequired,

    startOpen: PropTypes.bool.isRequired, // TODO: remove?

    headerRenderer: PropTypes.func,
    headerRendererProps: PropTypes.object,
    filterRenderer: PropTypes.func,
    filterRendererProps: PropTypes.object,
    fileRenderer: PropTypes.func,
    fileRendererProps: PropTypes.object,
    folderRenderer: PropTypes.func,
    folderRendererProps: PropTypes.object,
    detailRenderer: PropTypes.func,
    detailRendererProps: PropTypes.object,
    actionRenderer: PropTypes.func,
    confirmDeletionRenderer: PropTypes.func,
    confirmMultipleDeletionRenderer: PropTypes.func,

    onCreateFiles: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onCreateFolder: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onMoveFile: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onMoveFolder: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onRenameFile: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onRenameFolder: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onDeleteFile: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onDeleteFolder: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onDownloadFile: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onDownloadFolder: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onUploadFile: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
    onExternalViewerClick: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),

    onSelect: PropTypes.func,
    onSelectFile: PropTypes.func,
    onSelectFolder: PropTypes.func,
    onSelectionUpdate: PropTypes.func,

    onPreviewOpen: PropTypes.func,
    onPreviewClose: PropTypes.func,

    onFolderOpen: PropTypes.func,
    onFolderClose: PropTypes.func,
  }

  static defaultProps = {
    showActionBar: true,
    canFilter: true,
    showFoldersOnFilter: false,
    noFilesMessage: '',
    locale: 'en',
    backend: null,

    group: GroupByFolder,
    sort: SortByName,

    nestChildren: false,
    renderStyle: 'table',

    columns: Object.keys(BROWSER_COLUMNS).map((key) => BROWSER_COLUMNS[key]),

    startOpen: false,

    headerRenderer: TableHeader,
    headerRendererProps: {},
    filterRenderer: DefaultFilter,
    filterRendererProps: {},
    fileRenderer: TableFile,
    fileRendererProps: {},
    folderRenderer: TableFolder,
    folderRendererProps: {},
    detailRenderer: DefaultDetail,
    detailRendererProps: {},
    actionRenderer: DefaultAction,
    confirmDeletionRenderer: DefaultConfirmDeletion,
    confirmMultipleDeletionRenderer: MultipleConfirmDeletion,

    icons: {},

    onSelect: (fileOrFolder) => { }, // Always called when a file or folder is selected
    onSelectFile: (file) => { }, //    Called after onSelect, only on file selection
    onSelectFolder: (folder) => { }, //    Called after onSelect, only on folder selection
    onSelectionUpdate: () => {},

    onPreviewOpen: (file) => { }, // File opened
    onPreviewClose: (file) => { }, // File closed

    onFolderOpen: (folder) => { }, // Folder opened
    onFolderClose: (folder) => { }, // Folder closed
  }

  state = {
    openFolders: {},
    selection: [],
    activeAction: null,
    actionTargets: [],
    t: () => {},
    nameFilter: '',
    searchResultsShown: SEARCH_RESULTS_PER_PAGE,

    previewFile: null,

    addFolder: null,
  }

  componentDidMount() {
    if (!this.state.locale && this.props.locale) {
      i18n.changeLanguage(this.props.locale).then(r => this.setState({ t: this.props.t }))
    }

    if (this.props.renderStyle === 'table' && this.props.nestChildren) {
      console.warn('Invalid settings: Cannot nest table children in file browser')
    }

    window.addEventListener('click', this.handleGlobalClick)
  }

  componentWillUnmount() {
    window.removeEventListener('click', this.handleGlobalClick)
  }

  getFile = (key) => {
    let hasPrefix = false
    const exactFolder = this.props.files.find((f) => {
      if (f.key.startsWith(key)) {
        hasPrefix = true
      }
      return f.key === key
    })
    if (exactFolder) {
      return exactFolder
    }
    if (hasPrefix) {
      return { key, modified: 0, size: 0, relativeKey: key }
    }
  }

  // item manipulation
  createFiles = (files, prefix) => {
    this.setState(prevState => {
      const stateChanges = { selection: [] }
      this.props.onSelectionUpdate([])
      if (prefix) {
        stateChanges.openFolders = {
          ...prevState.openFolders,
          [prefix]: true,
        }
      }
      return stateChanges
    }, () => {
      this.props.onCreateFiles(files, prefix)
    })
  }

  createFolder = (key) => {
    this.setState({
      activeAction: null,
      actionTargets: [],
      selection: [key],
    }, () => {
      this.props.onSelectionUpdate([key])
      this.props.onCreateFolder(key)
    })
  }

  moveFile = (oldKey, newKey) => {
    this.setState({
      activeAction: null,
      actionTargets: [],
      selection: [newKey],
    }, () => {
      this.props.onSelectionUpdate([newKey])
      this.props.onMoveFile(oldKey, newKey)
    })
  }

  moveFolder = (oldKey, newKey) => {
    this.setState(prevState => {
      const stateChanges = {
        activeAction: null,
        actionTargets: [],
        selection: [newKey],
      }
      if (oldKey in prevState.openFolders) {
        this.props.onSelectionUpdate([newKey])
        stateChanges.openFolders = {
          ...prevState.openFolders,
          [newKey]: true,
        }
      }
      return stateChanges
    }, () => {
      this.props.onMoveFolder(oldKey, newKey)
    })
  }

  renameFile = (oldKey, newKey) => {
    this.setState({
      activeAction: null,
      actionTargets: [],
      selection: [newKey],
    }, () => {
      this.props.onSelectionUpdate([newKey])
      this.props.onRenameFile(oldKey, newKey)
    })
  }

  renameFolder = (oldKey, newKey) => {
    this.setState(prevState => {
      const stateChanges = {
        activeAction: null,
        actionTargets: [],
      }
      if (prevState.selection[0].substr(0, oldKey.length) === oldKey) {
        stateChanges.selection = [prevState.selection[0].replace(oldKey, newKey)]
      }
      if (oldKey in prevState.openFolders) {
        stateChanges.openFolders = {
          ...prevState.openFolders,
          [newKey]: true,
        }
      }
      return stateChanges
    }, () => {
      this.props.onSelectionUpdate(this.state.selection)
      this.props.onRenameFolder(oldKey, newKey)
    })
  }

  deleteFile = (keys) => {
    this.setState({
      activeAction: null,
      actionTargets: [],
      selection: [],
    }, () => {
      this.props.onSelectionUpdate([])
      this.props.onDeleteFile(keys)
    })
  }

  deleteFolder = (key) => {
    this.setState(prevState => {
      const stateChanges = {
        activeAction: null,
        actionTargets: [],
        selection: [],
      }
      if (key in prevState.openFolders) {
        stateChanges.openFolders = { ...prevState.openFolders }
        delete stateChanges.openFolders[key]
      }
      return stateChanges
    }, () => {
      this.props.onSelectionUpdate([])
      this.props.onDeleteFolder(key)
    })
  }

  downloadFile = (keys) => {
    this.setState({
      activeAction: null,
      actionTargets: [],
    }, () => {
      if (typeof this.props.onDownloadFile === 'function') { this.props.onDownloadFile(keys) }
    })
  }

  downloadFolder = (keys) => {
    this.setState({
      activeAction: null,
      actionTargets: [],
    }, () => {
      this.props.onDownloadFolder(keys)
    })
  }

  // browser manipulation
  beginAction = (action, keys) => {
    this.setState({
      activeAction: action,
      actionTargets: keys || [],
    })
  }

  endAction = () => {
    if (this.state.selection && this.state.selection.length > 0 && (
      this.state.selection.filter((selection) => selection.match(regexForNewFolderOrFileSelection)).length > 0
    )) {
      this.setState({ selection: [] })
      this.props.onSelectionUpdate([])
    }
    this.beginAction(null, null)
  }

  select = (key, selectedType, ctrlKey, shiftKey) => {
    const { actionTargets } = this.state
    const shouldClearState = actionTargets.length && !actionTargets.includes(key)
    const selected = this.getFile(key)

    let newSelection = [key]
    if (ctrlKey || shiftKey) {
      const indexOfKey = this.state.selection.indexOf(key)
      if (indexOfKey !== -1) {
        newSelection = [...this.state.selection.slice(0, indexOfKey), ...this.state.selection.slice(indexOfKey + 1)]
      } else {
        newSelection = [...this.state.selection, key]
      }
    }

    this.setState(prevState => ({
      selection: newSelection,
      actionTargets: shouldClearState ? [] : actionTargets,
      activeAction: shouldClearState ? null : prevState.activeAction,
    }), () => {
      this.props.onSelectionUpdate(newSelection)
      this.props.onSelect(selected)

      if (selectedType === 'file') this.props.onSelectFile(selected)
      if (selectedType === 'folder') this.props.onSelectFolder(selected)
    })
  }

  preview = (file) => {
    if (this.state.previewFile && this.state.previewFile.key !== file.key) this.closeDetail()

    this.setState({
      previewFile: file,
    }, () => {
      this.props.onPreviewOpen(file)
    })
  }

  closeDetail = () => {
    this.setState({
      previewFile: null,
    }, () => {
      this.props.onPreviewClose(this.state.previewFile)
    })
  }

  handleShowMoreClick = (event) => {
    event.preventDefault()
    this.setState(prevState => ({
      searchResultsShown: prevState.searchResultsShown + SEARCH_RESULTS_PER_PAGE,
    }))
  }

  toggleFolder = (folderKey) => {
    const isOpen = folderKey in this.state.openFolders
    this.setState(prevState => {
      const stateChanges = {
        openFolders: { ...prevState.openFolders },
      }
      if (isOpen) {
        delete stateChanges.openFolders[folderKey]
      } else {
        stateChanges.openFolders[folderKey] = true
      }
      return stateChanges
    }, () => {
      const callback = isOpen ? 'onFolderClose' : 'onFolderOpen'
      this.props[callback](this.getFile(folderKey))
    })
  }

  openFolder = (folderKey) => {
    this.setState(prevState => ({
      openFolders: {
        ...prevState.openFolders,
        [folderKey]: true,
      },
    }), () => {
      this.props.onFolderOpen(this.getFile(folderKey))
    })
  }

  // event handlers
  handleGlobalClick = (event) => {
    const inBrowser = !!(this.browserRef && this.browserRef.contains(event.target))

    if (!inBrowser) {
      this.setState({
        selection: [],
        actionTargets: [],
        activeAction: null,
      })
      this.props.onSelectionUpdate([])
    }
  }
  handleActionBarRenameClick = (event) => {
    event.preventDefault()
    this.beginAction('rename', this.state.selection)
  }
  handleActionBarDeleteClick = (event) => {
    event.preventDefault()
    this.beginAction('delete', this.state.selection)
  }
  handleActionBarAddFolderClick = (event) => {
    event.preventDefault()
    if (this.state.activeAction === 'createFolder') {
      return
    }
    this.setState(prevState => {
      let addKey = ''
      if (prevState.selection && prevState.selection.length > 0) {
        addKey += prevState.selection
        if (addKey.substr(addKey.length - 1, addKey.length) !== '/') {
          addKey += '/'
        }
      }

      if (addKey !== '__new__/' && !addKey.endsWith('/__new__/')) addKey += '__new__/'
      const stateChanges = {
        actionTargets: [addKey],
        activeAction: 'createFolder',
        selection: [addKey],
      }
      if (prevState.selection && prevState.selection.length > 0) {
        stateChanges.openFolders = {
          ...prevState.openFolders,
          [this.state.selection]: true,
        }
      }
      return stateChanges
    })
    this.props.onSelectionUpdate(this.state.selection)
  }
  handleActionBarDownloadClick = (event) => {
    event.preventDefault()

    const files = this.getFiles()
    const selectedItems = this.getSelectedItems(files)

    const selectionIsFolder = (selectedItems.length === 1 && isFolder(selectedItems[0]))
    if (selectionIsFolder) {
      this.downloadFolder(this.state.selection)
      return
    }

    this.downloadFile(this.state.selection)
  }

  handleActionBarUploadClick = () => {
    this.props.onUploadFile(this.state.selection)
  }

  handleActionBarExternalViewerClick = () => {
    const files = this.getFiles()
    const selectedItems = this.getSelectedItems(files)
    this.props.onExternalViewerClick(selectedItems.length === 1 ? selectedItems[0] : null)
  }

  handleFileDoubleClick = (itemKey) => {
    if (typeof this.props.onFileDoubleClick === 'function') { this.props.onFileDoubleClick(itemKey) }
  }

  updateFilter = (newValue) => {
    this.setState({
      nameFilter: newValue,
      searchResultsShown: SEARCH_RESULTS_PER_PAGE,
    })
  }

  getBrowserProps() {
    return {
      // browser config
      nestChildren: this.props.nestChildren,
      fileRenderer: this.props.fileRenderer,
      fileRendererProps: this.props.fileRendererProps,
      folderRenderer: this.props.folderRenderer,
      folderRendererProps: this.props.folderRendererProps,
      confirmDeletionRenderer: this.props.confirmDeletionRenderer,
      confirmMultipleDeletionRenderer: this.props.confirmMultipleDeletionRenderer,
      icons: this.props.icons,
      backend: this.props.backend,

      // browser state
      openFolders: this.state.openFolders,
      nameFilter: this.state.nameFilter,
      selection: this.state.selection,
      activeAction: this.state.activeAction,
      actionTargets: this.state.actionTargets,

      // browser manipulation
      select: this.select,
      openFolder: this.openFolder,
      toggleFolder: this.toggleFolder,
      beginAction: this.beginAction,
      endAction: this.endAction,
      preview: this.preview,
      fileDoubleClick: this.handleFileDoubleClick,
      // item manipulation
      createFiles: this.props.onCreateFiles ? this.createFiles : undefined,
      createFolder: this.props.onCreateFolder ? this.createFolder : undefined,
      renameFile: this.props.onRenameFile ? this.renameFile : undefined,
      renameFolder: this.props.onRenameFolder ? this.renameFolder : undefined,
      moveFile: this.props.onMoveFile ? this.moveFile : undefined,
      moveFolder: this.props.onMoveFolder ? this.moveFolder : undefined,
      deleteFile: this.props.onDeleteFile ? this.deleteFile : undefined,
      deleteFolder: this.props.onDeleteFolder ? this.deleteFolder : undefined,

      getItemProps: getItemProps,
    }
  }

  renderActionBar(selectedItems) {
    const {
      icons, canFilter,
      filterRendererProps, filterRenderer: FilterRenderer,
      actionRenderer: ActionRenderer,
      onCreateFolder, onRenameFile, onRenameFolder,
      onDeleteFile, onDeleteFolder, onDownloadFile,
      onDownloadFolder, onUploadFile, onExternalViewerClick,
    } = this.props
    const browserProps = this.getBrowserProps()
    const selectionIsFolder = (selectedItems.length === 1 && isFolder(selectedItems[0]))
    const hasFileExternalViewer = (selectedItems.length === 1 && selectedItems[0]?.with_external_viewer)

    let filter
    if (canFilter) {
      filter = (
        <FilterRenderer
          value={this.state.nameFilter}
          updateFilter={this.updateFilter}
          {...filterRendererProps}
        />
      )
    }

    const actions = (
      <ActionRenderer
        browserProps={browserProps}

        selectedItems={selectedItems}
        isFolder={selectionIsFolder}

        icons={icons}
        nameFilter={this.state.nameFilter}

        canCreateFolder={typeof onCreateFolder === 'function'}
        onCreateFolder={this.handleActionBarAddFolderClick}

        canRenameFile={typeof onRenameFile === 'function'}
        onRenameFile={this.handleActionBarRenameClick}

        canRenameFolder={typeof onRenameFolder === 'function'}
        onRenameFolder={this.handleActionBarRenameClick}

        canDeleteFile={typeof onDeleteFile === 'function'}
        onDeleteFile={this.handleActionBarDeleteClick}

        canDeleteFolder={typeof onDeleteFolder === 'function'}
        onDeleteFolder={this.handleActionBarDeleteClick}

        canDownloadFile={typeof onDownloadFile === 'function'}
        onDownloadFile={this.handleActionBarDownloadClick}

        canDownloadFolder={typeof onDownloadFolder === 'function'}
        onDownloadFolder={this.handleActionBarDownloadClick}

        canUploadFile={typeof onUploadFile === 'function'}
        onUploadFile={this.handleActionBarUploadClick}

        canExternalViewer={typeof onExternalViewerClick === 'function' && hasFileExternalViewer}
        onExternalViewerClick={this.handleActionBarExternalViewerClick}

        // canFileDoubleClick={typeof onFileDoubleClick === 'function'}
        onFileDoubleClick={this.handleFileDoubleClick}
      />
    )

    return (
      <div className="action-bar">
        {filter}
        {actions}
      </div>
    )
  }

  renderFiles(files, depth) {
    const {
      fileRenderer: FileRenderer, fileRendererProps,
      folderRenderer: FolderRenderer, folderRendererProps,
    } = this.props
    const browserProps = this.getBrowserProps()
    let renderedFiles = []

    files.map((file) => {
      const thisItemProps = {
        ...browserProps.getItemProps(file, browserProps),
        depth: this.state.nameFilter ? 0 : depth,
      }

      if (!isFolder(file)) {
        renderedFiles.push(
          <FileRenderer
            {...file}
            {...thisItemProps}
            browserProps={browserProps}
            {...fileRendererProps}
            columns={this.props.columns}
          />
        )
      } else {
        if (this.props.showFoldersOnFilter || !this.state.nameFilter) {
          renderedFiles.push(
            <FolderRenderer
              {...file}
              {...thisItemProps}
              browserProps={browserProps}
              {...folderRendererProps}
            />
          )
        }
        if (this.state.nameFilter || (thisItemProps.isOpen && !browserProps.nestChildren)) {
          renderedFiles = renderedFiles.concat(this.renderFiles(file.children, depth + 1))
        }
      }
    })
    return renderedFiles
  }

  handleMultipleDeleteSubmit = () => {
    this.deleteFolder(this.state.selection.filter(selection => selection[selection.length - 1] === '/'))
    this.deleteFile(this.state.selection.filter(selection => selection[selection.length - 1] !== '/'))
  }

  getFiles() {
    let files = this.props.files.concat([])
    if (this.state.activeAction === 'createFolder') {
      files.push({
        key: this.state.actionTargets[0],
        size: 0,
        draft: true,
      })
    }
    if (this.state.nameFilter) {
      const filteredFiles = []
      const terms = this.state.nameFilter.toLowerCase().split(' ')
      files.map((file) => {
        let skip = false
        terms.map((term) => {
          if (file.key.toLowerCase().trim().indexOf(term) === -1) {
            skip = true
          }
        })
        if (skip) {
          return
        }
        filteredFiles.push(file)
      })
      files = filteredFiles
    }
    if (typeof this.props.group === 'function') {
      files = this.props.group(files, '')
    } else {
      const newFiles = []
      files.map((file) => {
        if (!isFolder(file)) {
          newFiles.push(file)
        }
      })
      files = newFiles
    }
    if (typeof this.props.sort === 'function') {
      files = this.props.sort(files)
    }
    return files
  }

  getSelectedItems(files) {
    const { selection } = this.state
    const selectedItems = []
    const findSelected = (item) => {
      if (selection.includes(item.key)) {
        selectedItems.push(item)
      }
      if (item.children) {
        item.children.map(findSelected)
      }
    }
    files.map(findSelected)
    return selectedItems
  }

  render() {
    const { t } = this.props
    const browserProps = this.getBrowserProps()
    const headerProps = {
      browserProps,
      fileKey: '',
      fileCount: this.props.files.length,
    }
    let renderedFiles

    const files = this.getFiles()
    const selectedItems = this.getSelectedItems(files)

    let header
    /** @type any */
    let contents = this.renderFiles(files, 0)
    switch (this.props.renderStyle) {
      case 'table':
        if (!contents.length) {
          if (this.state.nameFilter) {
            contents = (
              <tr>
                <td colSpan={100}>
                  {this.state.t('noFilesMatching')}"{this.state.nameFilter}".
                </td>
              </tr>
            )
          } else {
            contents = (
              <tr>
                <td colSpan={100}>
                  {this.props.noFilesMessage ? this.props.noFilesMessage : this.state.t('noFiles')}
                </td>
              </tr>
            )
          }
        } else {
          if (this.state.nameFilter) {
            const numFiles = contents.length
            contents = contents.slice(0, this.state.searchResultsShown)
            if (numFiles > contents.length) {
              contents.push(
                <tr key="show-more">
                  <td colSpan={100}>
                    <a
                      onClick={this.handleShowMoreClick}
                      href="#"
                    >
                      Show more results
                    </a>
                  </td>
                </tr>
              )
            }
          }
        }

        if (this.props.headerRenderer) {
          header = (
            <thead>
              <this.props.headerRenderer
                {...headerProps}
                {...this.props.headerRendererProps}
                columns={this.props.columns}
              />
            </thead>
          )
        }

        renderedFiles = (
          <table className="table-bordered" cellSpacing="0" cellPadding="0">
            {header}
            <tbody>
              {contents}
            </tbody>
          </table>
        )
        break

      case 'list':
        if (!contents.length) {
          if (this.state.nameFilter) {
            contents = (<p className="empty">{this.state.t('noFilesMatching') + this.state.nameFilter}</p>)
          } else {
            contents = (<p className="empty">{this.state.t('noFiles')}</p>)
          }
        } else {
          let more
          if (this.state.nameFilter) {
            const numFiles = contents.length
            contents = contents.slice(0, this.state.searchResultsShown)
            if (numFiles > contents.length) {
              more = (
                <a
                  onClick={this.handleShowMoreClick}
                  href="#"
                >
                  Show more results
                </a>
              )
            }
          }
          contents = (
            <div>
              <ul>{contents}</ul>
              {more}
            </div>
          )
        }

        if (this.props.headerRenderer) {
          header = (
            <this.props.headerRenderer
              {...headerProps}
              {...this.props.headerRendererProps}
            />
          )
        }

        renderedFiles = (
          <div>
            {header}
            {contents}
          </div>
        )
        break
    }

    const ConfirmMultipleDeletionRenderer = this.props.confirmMultipleDeletionRenderer

    return (
      <DndProvider backend={this.props.backend}>
        <div className="rendered-react-keyed-file-browser">
          {this.props.actions}
          <div className="rendered-file-browser" ref={el => { this.browserRef = el }}>
            {this.props.showActionBar && this.renderActionBar(selectedItems)}
            {this.state.activeAction === 'delete' && this.state.selection.length > 1 &&
              <ConfirmMultipleDeletionRenderer
                handleDeleteSubmit={this.handleMultipleDeleteSubmit}
              />}
            <div className="files">
              {renderedFiles}
            </div>
          </div>
          {this.state.previewFile !== null && (
            <this.props.detailRenderer
              file={this.state.previewFile}
              close={this.closeDetail}
              {...this.props.detailRendererProps}
            />
          )}
        </div>
      </DndProvider>
    )
  }
}

// @DragDropContext(HTML5Backend)
class FileBrowser extends RawFileBrowser { }

export default withNamespaces()(FileBrowser)
export { RawFileBrowser }
