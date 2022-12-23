import React, { Component } from 'react';
import { Dialog, Input, Button, Icon ,Tree} from '@alifd/next';
import { PluginProps } from '@alilc/lowcode-types';
import { event, project } from '@alilc/lowcode-engine';
import MonacoEditor from '@alilc/lowcode-plugin-base-monaco-editor';
import './index.less';

const HelpText = `You can bind variables or processing functions by clicking on the left area, and of course you can also enter complex expressions above.
Variables are supported by default in the input box, and the writing method is exactly the same as the JS writing method.<br>
this: 'container context object'<br>
state: 'the state of the container'<br>
props: 'container props'<br>
context: 'The context of the container'<br>
schema: 'page context object'<br>
component: 'component context object'<br>
constants: 'application constant object'<br>
utils: 'utility object'<br>
dataSourceMap: 'container data source map'<br>
field: 'form field object'
`;

const defaultEditorProps = {
  width: '100%',
  height:'200px'
};

const defaultEditorOption = {
  readOnly: false,
  automaticLayout: true,
  folding: true, // 默认开启折叠代码功能
  lineNumbers: 'on',
  wordWrap: 'off',
  formatOnPaste: true,
  fontSize: 12,
  tabSize: 2,
  scrollBeyondLastLine: false,
  fixedOverflowWidgets: false,
  snippetSuggestions: 'top',
  minimap: {
    enabled: false,
  },
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
  },
};

export default class VariableBindDialog extends Component<PluginProps> {
  state = {
    visiable: false,
    // stateVaroableList: [],
    helpText: HelpText,
    // contextKeys: [],
    jsCode: '',
    searchValue: '',
    variableListMap: {}, // 变量列表
    selParentVariable: null, // 选中的父级变量
    childrenVariableList: [], // 子级变量列表
    field: {}, // 编辑器全局变量
    treeList:[],
    minimize: false, // 是否最小化
    autoExpandParent: true,
    expandedKeys:[],
  };

  private editorJsRef = React.createRef();

  private monocoEditor: any;

  private matchedKeys:null;

  componentDidMount() {
    event.on('common:variableBindDialog.openDialog', ({ field }) => {
      this.setState({ field }, () => {
        this.initCode();
        this.openDialog();
      });
    });
  }

  exportSchema = () => {
     // 可以定制getSchema方法
     return this.props.config?.props?.getSchema?.() || project.exportSchema();
  }

  initCode = () => {
    const { field } = this.state;
    const fieldValue = field.getValue();
    const jsCode = fieldValue?.value;

    this.setState({
      jsCode,
      // fullScreenStatus: false,
      // stateVaroableList: [],
      searchValue: '',
      variableListMap: {}, // 变量列表
      selParentVariable: null, // 选中的父级变量
      childrenVariableList: [], // 子级变量列表
      minimize: false, // 是否最小化
    });
  };

  /**
   * 获取methods数据源
   * @param  {String}
   * @return {Array}
   */
  getMethods(): any[] {
    const schema = this.exportSchema();
    const methodsMap = schema.componentsTree[0]?.methods;
    const methods = [];
    for (const key in methodsMap) {
      if (Object.prototype.hasOwnProperty.call(methodsMap, key) && key) {
        // methods.push(`${key}()`);
        methods.push({
          label:`${key}`,
          key,
        })
      }
    }

    return methods;
  }

  /**
   * 获取AutoComplete数据源
   * @param  {String}
   * @return {Array}
   */
  getVarableList(): any[] {
    const schema = this.exportSchema();

    const stateMap = schema.componentsTree[0]?.state;
    const dataSourceMap = {};
    const dataSource = [];

    for (const key in stateMap) {
      if (Object.prototype.hasOwnProperty.call(stateMap, key) && key) {
        dataSource.push(`this.state.${key}`);
        const valueString = stateMap[key].value;
        let value;
        try{
          value = eval('('+valueString+')');
        }catch(e){}
        
        if (value){
          dataSourceMap[key] = value;
        }
      }
    }
    let treeList = [];
    this.walkNode(dataSourceMap,-1,treeList);
    // this.setState({
    //   treeList
    // })
    return treeList;
  }

  /**
   * 通过子节点id查找节点path
   * @param tree 
   * @param func 
   * @param field 
   * @param path 
   * @returns 
   */
  treeFindPath(tree, func, field = "", path = []) {
    if (!tree) return []
    for (const data of tree) {
      field === "" ? path.push(data) : path.push(data[field]);
      if (func(data)) return path
      if (data.children) {
        const findChildren = this.treeFindPath(data.children, func, field, path)
        if (findChildren.length) return findChildren
      }
      path.pop()
    }
    return []
  }

  /**
   * 循环遍历节点
   * @param dataSourceMap 
   * @param deepNum 
   * @param treeList 
   */
  walkNode (dataSourceMap,deepNum,treeList){
    deepNum++;
    let index = 0
    for (let key in dataSourceMap){
      let treeData = {};
      treeData.label = key;
      //treeData.key = deepNum+'_'+index;
      if (typeof(dataSourceMap[key])=='object' && !(dataSourceMap[key] instanceof Array)){
        treeData.children = [];
        this.walkNode(dataSourceMap[key],deepNum,treeData.children);
      }
      index++;
      treeList.push(treeData);
    }
  }

  /**
   * 获取数据源面板中的数据
   * @param  {String}
   * @return {Array}
   */
  getDataSource(): any[] {
    const schema = this.exportSchema();
    const stateMap = schema.componentsTree[0]?.dataSource;
    const list = stateMap?.list || [];
    const dataSource = [];

    for (const item of list) {
      if (item && item.id) {
        // dataSource.push(`this.state.${item.id}`);
        dataSource.push({
          label:`${item.id}`,
          key:item.id
        })
      }
    }

    return dataSource;
  }

  /**
   * 获取输入的上下文信息
   * @param  {Array}
   * @return {Array}
   */
  getContextKeys(keys?: []) {
    const { editor } = this.props;
    const limitKeys = ['schema', 'utils', 'constants'];
    if (!keys || keys.length === 0) return limitKeys;
    if (!limitKeys.includes(keys[0])) return [];
    let result = [];
    let keyValue = editor;
    let assert = false;
    keys.forEach((item) => {
      if (!keyValue[item] || typeof keyValue[item] !== 'object') {
        assert = true;
      }
      if (keyValue[item]) {
        keyValue = keyValue[item];
      }
    });
    if (assert) return [];
    result = Object.keys(keyValue);
    return result;
  }

  openDialog = () => {
    this.setState(
      {
        visiable: true,
      },
      () => {
        const methods = this.getMethods();
        const stateVaroableList = this.getVarableList();
        const dataSource = this.getDataSource();

        this.setState({
          variableListMap: {
            stateVaroableList: {
              name: 'State property',
              childrens: stateVaroableList,
            },
            methods: {
              name: 'Custom handler',
              childrens: methods,
            },
            dataSource: {
              name: 'Data source',
              childrens: dataSource,
            },
          },
        });
      },
    );
  };

  closeDialog = () => {
    this.setState({
      visiable: false,
      minimize: false,
    });
  };

  onSelectItem = (value: string) => {
    const { lineNumber, column } = this.monocoEditor.getPosition();
    this.monocoEditor.executeEdits('insert-code', [
      {
        range: {
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: lineNumber,
          endColumn: column,
        },
        text: value,
      },
    ]);
  };

  updateCode = (newCode) => {
    this.setState(
      {
        jsCode: newCode,
      },
      this.autoSave,
    );
  };

  autoSave = () => {
    const { autoSave } = this.props;
    if (autoSave) {
      this.onOk(true);
    }
  };

  editorDidMount = (editor) => {
    this.monocoEditor = editor;

    setTimeout(() => {
      this.editorNode = this.editorJsRef.current; // 记录当前dom节点；
    }, 0);
  };

  onOk = (autoSave) => {
    const { field, jsCode } = this.state;
    const fieldValue = field.getValue();
    field.setValue({
      type: 'JSExpression',
      value: jsCode,
      mock:
        Object.prototype.toString.call(fieldValue) === '[object Object]'
          ? fieldValue.mock
          : fieldValue,
    });
    if (autoSave !== true) {
      this.closeDialog();
    }
  };

  removeTheBinding = () => {
    const { field } = this.state;
    const fieldValue = field.getValue();
    const value =
      Object.prototype.toString.call(fieldValue) === '[object Object]'
        ? fieldValue.mock
        : fieldValue;
    field.setValue(value);
    this.closeDialog();
  };

  renderBottom = () => {
    const { jsCode } = this.state;
    return (
      <div className="variable-bind-dialog-bottom">
        <div className="bottom-left-container">
          {jsCode && jsCode.length > 0 && (
            <Button type="normal" warning onClick={this.removeTheBinding}>
              Remove binding
            </Button>
          )}
        </div>

        <div className="bottom-right-container">
          <Button type="primary" onClick={this.onOk}>
            Confirm
          </Button>
          &nbsp;&nbsp;
          <Button type="normal" onClick={this.closeDialog}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  handleExpand = (keys) =>{
    this.setState({
      expandedKeys: keys,
      autoExpandParent: false
    });
  }


  onVariableSearchChange = (value) => {
    this.setState({
      searchValue: value,
    });

    const { variableListMap, selParentVariable } = this.state;
    const selectedVariable = variableListMap[selParentVariable];
    if (!selectedVariable) {
      return;
    }
    value = value.trim();
    if (!value) {
      this.matchedKeys = null;
      return;
    }

    const matchedKeys = [];
    const loop = data =>
      data.forEach(item => {
        if (item.label.indexOf(value) > -1) {
          matchedKeys.push(item.key);
        }
        if (item.children && item.children.length) {
          loop(item.children);
        }
      });
    loop(selectedVariable.childrens);
    this.setState({
      expandedKeys: [...matchedKeys],
      autoExpandParent: true
    });
    this.matchedKeys = matchedKeys;

  };

  onVariableItemClick = (key: string) => {
    const { variableListMap } = this.state;

    const childrenVariableList = variableListMap[key].childrens;
    // const matchedKeys = [];
    // const loop = data =>
    //   data.forEach(item => {
    //     if (item.label.indexOf(value) > -1) {
    //       matchedKeys.push(item.key);
    //     }
    //     if (item.children && item.children.length) {
    //       loop(item.children);
    //     }
    //   });
    // loop(childrenVariableList);

    this.setState({
      selParentVariable: key,
      childrenVariableList,
      // matchedKeys
    });
  };

  minimizeClick = (state) => {
    this.setState({
      minimize: state,
      visiable: !state,
    });
  };

  onSelectTreeNode = (selectedKeys,extra) => {
    const {selParentVariable,childrenVariableList} = this.state;

    const label = extra.selectedNodes[0]?.props?.label;
    const key = extra.selectedNodes[0]?.key;
    let selectLabel;
    if (selParentVariable == 'stateVaroableList'){
      const pathList = this.treeFindPath(childrenVariableList,data=>(data.key==key),'label');
      selectLabel = `this.state.${pathList.join('.')}`
    }else if (selParentVariable == 'methods'){
      selectLabel = `${label}()`;
    }else if (selParentVariable == 'dataSource'){
      selectLabel = `this.state.${label}`
    }
    this.onSelectItem(selectLabel);
    
  }


  renderTitle = () => {
    return (
      <div className="variable-dialog-title">
        <span>Variable binding</span>
        <img
          style={{ width: '12px' }}
          src="https://img.alicdn.com/imgextra/i1/O1CN01NlC5mY1bTvrlW3blw_!!6000000003467-55-tps-200-200.svg"
          onClick={() => this.minimizeClick(true)}
        />
      </div>
    );
  };

  render() {
    const {
      visiable,
      variableListMap,
      selParentVariable,
      childrenVariableList,
      helpText,
      jsCode,
      searchValue,
      minimize,
      expandedKeys,
      autoExpandParent
    } = this.state;

    const filterTreeNode = node => {
      return (
        this.matchedKeys && this.matchedKeys.indexOf(node.props.eventKey) > -1
      );
    };

    return (
      <div>
        {minimize ? (
          <div className="vs-variable-minimize">
            <img
              onClick={() => this.minimizeClick(false)}
              src="https://img.alicdn.com/imgextra/i2/O1CN01HzeCND1vl948xPEWm_!!6000000006212-55-tps-200-200.svg"
            />
            <span onClick={() => this.minimizeClick(false)} className="vs-variable-minimize-title">
              Variable binding
            </span>
            <img
              onClick={this.closeDialog}
              src="https://img.alicdn.com/imgextra/i2/O1CN017cO64O1DzwlxwDSKW_!!6000000000288-55-tps-200-200.svg"
            />
          </div>
        ) : (
          ''
        )}

        <Dialog
          visible={!minimize && visiable}
          title={this.renderTitle()}
          onClose={this.closeDialog}
          footer={this.renderBottom()}
          popupContainer={
            document.getElementById('engine-popup-container') ? 'engine-popup-container' : undefined
          }
        >
          <div className="variable-dialog-body">
            <div className="dialog-left-container">
              <div className="dialog-small-title">Variable list</div>

              <div className="vs-variable-selector-inner">
                <ul className="vs-variable-selector-category vs-variable-selector-ul">
                  {Object.keys(variableListMap).map((key) => {
                    return (
                      <li
                        onClick={() => this.onVariableItemClick(key)}
                        className={selParentVariable === key && 'active'}
                        key={key}
                      >
                        {variableListMap[key].name}
                      </li>
                    );
                  })}



                </ul>
                <div className="vs-variable-selector-items-container">
                  <div className="ve-search-control">
                    <Input
                      innerAfter={<Icon type="search" size="xs" style={{ margin: 4 }} />}
                      placeholder="search"
                      value={searchValue}
                      aria-label="search"
                      style={{ width: '100%' }}
                      onChange={this.onVariableSearchChange}
                    />
                  </div>
                  {/* <ul className="vs-variable-selector-items vs-variable-selector-ul"> */}
                  <ul className="tree-container">
                    {/* {childrenVariableList &&
                      childrenVariableList.map((item) => (
                        <li onClick={() => this.onSelectItem(item)} key={item}>
                          {item}
                        </li>
                      ))} */}

                    <Tree 
                      dataSource={childrenVariableList} 
                      onSelect={this.onSelectTreeNode} 
                      defaultExpandAll 
                      filterTreeNode={filterTreeNode}
                      expandedKeys={expandedKeys}
                      autoExpandParent={autoExpandParent}
                      onExpand={this.handleExpand}
                    />
                  </ul>
                </div>
              </div>
            </div>

            <div className="dialog-right-container">
              <div className="dialog-small-title">To bind</div>
              <div id="jsEditorDom" className="editor-context" ref={this.editorJsRef}>
                <MonacoEditor
                  value={jsCode}
                  {...defaultEditorProps}
                  {...defaultEditorOption}
                  {...{ language: 'javascript' }}
                  onChange={(newCode) => this.updateCode(newCode)}
                  editorDidMount={(useMonaco, editor) => {
                    this.editorDidMount.call(this, editor, useMonaco);
                  }}
                />
              </div>

              <div className="dialog-help-tip-input">
                <p className="vs-variable-content-desc-title">Usage</p>
                <p dangerouslySetInnerHTML={{ __html: helpText }} />
              </div>
            </div>
          </div>
        </Dialog>
      </div>
    );
  }
}
