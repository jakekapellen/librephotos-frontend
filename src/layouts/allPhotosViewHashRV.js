import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import { Grid, WindowScroller,AutoSizer } from 'react-virtualized';
import 'react-virtualized/styles.css'; // only needs to be imported once
import { connect } from "react-redux";
import {  
    fetchDateAlbumsPhotoHashList,
    fetchAlbumsDateGalleries,
    fetchUserAlbumsList,
    editUserAlbum,
    createNewUserAlbum
} from '../actions/albumsActions'
import { 
    fetchPhotos, 
    fetchPhotoDetail, 
    setPhotosFavorite,
    setPhotosHidden
} from '../actions/photosActions'
import { Card, Image, Header, Divider, Item, Loader, Dimmer, Sticky, Portal, List, Input, Rating, 
         Container, Label, Popup, Segment, Button, Icon, Table, Transition, Breadcrumb} from 'semantic-ui-react';
import {Server, serverAddress} from '../api_client/apiClient'
import {LightBox} from '../components/lightBox'
import LazyLoad from 'react-lazyload';
// import Lightbox from 'react-image-lightbox';
import {LocationMap} from '../components/maps'
import { push } from 'react-router-redux'
import {searchPhotos} from '../actions/searchActions'
import styles from '../App.css';
import Draggable from 'react-draggable';
import debounce from 'lodash/debounce'
import _ from 'lodash'
import * as moment from 'moment';
import Modal from 'react-modal';

import {calculateGridCells, calculateGridCellSize} from '../util/gridUtils'
import {ScrollSpeed, SPEED_THRESHOLD, SCROLL_DEBOUNCE_DURATION} from '../util/scrollUtils'

var topMenuHeight = 55 // don't change this
var leftMenuWidth = 85 // don't change this
var SIDEBAR_WIDTH = 85
var timelineScrollWidth = 0
var DAY_HEADER_HEIGHT = 70

if (window.innerWidth < 600) {
    var LIGHTBOX_SIDEBAR_WIDTH = window.innerWidth
} else {
    var LIGHTBOX_SIDEBAR_WIDTH = 360
}

const customStyles = {
    content : {
        top:150,
        left:'30%',
        right:'30%',
        height:window.innerHeight-300,
        width:'40%',
        overflow:'hidden',
        // paddingRight:0,
        // paddingBottomt:0,
        // paddingLeft:10,
        // paddingTop:10,
        padding:0,
        backgroundColor:'white'
    }
};


export class AllPhotosHashListViewRV extends Component {

    constructor(props){
        super(props)
        this.cellRenderer = this.cellRenderer.bind(this)
        this.handleResize = this.handleResize.bind(this)
        this.onPhotoClick = this.onPhotoClick.bind(this)
        this.getPhotoDetails = this.getPhotoDetails.bind(this)
        this.listRef = React.createRef()
        this.state = {
            cellContents: [[]],
            imagesGroupedByDate: [],
            hash2row: {},
            idx2hash: [],
            photos: {},
            lightboxImageIndex: 1,
            lightboxShow:false,
            lightboxSidebarShow:false,
            scrollToIndex: undefined,
            width:  window.innerWidth,
            height: window.innerHeight,
            entrySquareSize:200,
            numEntrySquaresPerRow:3,
            currTopRenderedRowIdx:0,
            scrollTop:0,
            selectMode:false,
            selectedImageHashes:[],
            modalAddToAlbumOpen:false,

        }
    }

    scrollSpeedHandler = new ScrollSpeed();

    handleScroll = ({scrollTop}) => {
        // scrollSpeed represents the number of pixels scrolled since the last scroll event was fired
        const scrollSpeed = Math.abs(this.scrollSpeedHandler.getScrollSpeed(scrollTop));

        if (scrollSpeed >= SPEED_THRESHOLD) {
          this.setState({
            isScrollingFast: true,
            scrollTop:scrollTop
          });
        }

        // Since this method is debounced, it will only fire once scrolling has stopped for the duration of SCROLL_DEBOUNCE_DURATION
        this.handleScrollEnd();
    }

    handleScrollEnd = debounce(() => {
    const {isScrollingFast} = this.state;

    if (isScrollingFast) {
      this.setState({
        isScrollingFast: false,
      });
    }
    }, SCROLL_DEBOUNCE_DURATION);



    componentDidMount() {
        this.props.dispatch(fetchPhotos())
        if (this.state.imagesGroupedByDate.length < 1) {
            this.props.dispatch(fetchDateAlbumsPhotoHashList())
        }
        this.handleResize();
        window.addEventListener("resize", this.handleResize.bind(this));
    }
  componentWillUnmount() {
    window.removeEventListener("resize", this.handleResize.bind(this))
    this.scrollSpeedHandler.clearTimeout()
  }

    handleResize() {
        var columnWidth = window.innerWidth - SIDEBAR_WIDTH - 5 - 5 - 10
        const {entrySquareSize,numEntrySquaresPerRow} = calculateGridCellSize(columnWidth)
        var {cellContents,hash2row} = calculateGridCells(this.state.imagesGroupedByDate,numEntrySquaresPerRow)

        this.setState({
            width:  window.innerWidth,
            height: window.innerHeight,
            entrySquareSize:entrySquareSize,
            numEntrySquaresPerRow:numEntrySquaresPerRow,
            cellContents: cellContents,
            hash2row:hash2row
        })
        if (this.listRef.current) {
            this.listRef.current.recomputeGridSize()
        }
    }

    onPhotoClick(hash) {
        this.setState({lightboxImageIndex:this.state.idx2hash.indexOf(hash),lightboxShow:true})
    }
    
    onPhotoSelect(hash) {
        var selectedImageHashes = this.state.selectedImageHashes
        if (selectedImageHashes.includes(hash)) {
            selectedImageHashes = selectedImageHashes.filter((item)=> item!==hash )
        } else {
            selectedImageHashes.push(hash)
        }
        this.setState({selectedImageHashes:selectedImageHashes})
        if (selectedImageHashes.length == 0) {
            this.setState({selectMode:false})
        }
    }

    onGroupSelect(hashes) {
        if (_.intersection(hashes,this.state.selectedImageHashes).length == hashes.length) { // for deselect
            var selectedImageHashes = _.difference(this.state.selectedImageHashes, hashes)
        } else {
            var selectedImageHashes = _.union(this.state.selectedImageHashes,hashes)
        }
        this.setState({selectedImageHashes:selectedImageHashes})
        if (selectedImageHashes.length == 0) {
            this.setState({selectMode:false})
        }
    }

    cellRenderer = ({ columnIndex, key, rowIndex, style }) => {
        if (this.state.cellContents[rowIndex][columnIndex]) { // non-empty cell
            const cell = this.state.cellContents[rowIndex][columnIndex]
            if (cell.date) { // header cell has 'date' attribute
                if (this.state.selectMode) {
                    return ( 
                        <div key={key} style={{...style,width:this.state.width,height:DAY_HEADER_HEIGHT,paddingTop:20}}>
                            <div style={{backgroundColor:'white',display:'inline-block'}}>
                                <Header as='h3'>
                                    <Icon name='calendar outline'/>
                                    <Header.Content>
                                        { cell.date=='No Timestamp' ? "No Timestamp" : moment(cell.date).format("MMM Do YYYY, dddd")} 
                                        <Header.Subheader>
                                            <Icon name='photo'/>{cell.photos.length} Photos 
                                        </Header.Subheader>
                                    </Header.Content>
                                </Header>
                            </div>
                            <div style={{float:'left',top:3,left:0,position:'relative'}}>
                                <Button 
                                    circular
                                    color={ _.intersection(cell.photos.map((el)=>el.image_hash),this.state.selectedImageHashes).length == cell.photos.length ? 'blue' : 'grey' }
                                    onClick={()=>{
                                        const hashes = cell.photos.map((p)=>p.image_hash)
                                        this.onGroupSelect(hashes)
                                    }}
                                    size='mini'  icon='checkmark'/>
                            </div>
                        </div>                
                    )   
                } else {
                    return ( 
                        <div key={key} style={{...style,width:this.state.width,height:DAY_HEADER_HEIGHT,paddingTop:20}}>
                            <div style={{backgroundColor:'white'}}>
                                <Header as='h3'>
                                    <Icon name='calendar outline'/>
                                    <Header.Content>
                                        { cell.date=='No Timestamp' ? "No Timestamp" : moment(cell.date).format("MMM Do YYYY, dddd")}
                                        <Header.Subheader>
                                            <Icon name='photo'/>{cell.photos.length} Photos
                                        </Header.Subheader>
                                    </Header.Content>
                                </Header>
                            </div>
                        </div>                
                    )   
                }
            } else { // photo cell doesn't have 'date' attribute
                if (!this.state.isScrollingFast) { // photo cell not scrolling fast
					if (this.props.photos[cell.image_hash] && this.props.photos[cell.image_hash].favorited) { 
						var favIcon = (
							<div style={{right:6,bottom:6,position:'absolute'}}>
								<Icon 
									circular 
									onClick={()=>{
										this.props.dispatch(setPhotosFavorite([cell.image_hash],false))
									}} 
									style={{backgroundColor:'white'}} 
									color='yellow'
									name='star'/>
							</div>
						)
					} else {
						var favIcon = (
							<div className='gridCellActions' style={{right:6,bottom:6,position:'absolute'}}>
								<Icon 
									circular 
									onClick={()=>{
										this.props.dispatch(setPhotosFavorite([cell.image_hash],true))
									}} 
									style={{backgroundColor:'white'}} 
									color='grey'
									name='star'/>
							</div>
						)
					}

                    if (this.props.photos[cell.image_hash] && this.props.photos[cell.image_hash].hidden) { 
                        var hiddenIcon = (
                            <div style={{left:6,bottom:6,position:'absolute'}}>
                                <Icon 
                                    circular 
                                    onClick={()=>{
                                        this.props.dispatch(setPhotosHidden([cell.image_hash],false))
                                    }} 
                                    style={{backgroundColor:'white'}} 
                                    color='red'
                                    name='hide'/>
                            </div>
                        )
                    } else {
                        var hiddenIcon = (
                            <div className='gridCellActions' style={{left:6,bottom:6,position:'absolute'}}>
                                <Icon 
                                    circular 
                                    onClick={()=>{
                                        this.props.dispatch(setPhotosHidden([cell.image_hash],true))
                                    }} 
                                    style={{backgroundColor:'white'}} 
                                    color='grey'
                                    name='hide'/>
                            </div>
                        )
                    }

                    if (this.state.selectMode) { // select mode
                        return (
                            <div 
                                className="gridCell"
                                key={key} style={{
                                ...style,
                                padding:15,
                                backgroundColor: this.state.selectedImageHashes.includes(cell.image_hash) ? '#AED6F1' : '#eeeeee' ,
                                margin:1,
                                width:style.width-2,
                                height:style.height-2}}>
                                
                                { this.props.photos[cell.image_hash] && this.props.photos[cell.image_hash].hidden ? 
                                    (
                                        <div style={{
                                            height:this.state.entrySquareSize-32,
                                            width:this.state.entrySquareSize-32,
                                            padding:0,
                                            margin:0,
                                            backgroundColor:'#dddddd'}}>
                                        </div>
                                    ) :
                                    (
                                        <Image key={'daygroup_image_'+cell.image_hash} style={{display:'inline-block',padding:1,margin:0}}
                                        height={this.state.entrySquareSize-30} 
                                        width={this.state.entrySquareSize-30} 
                                        src={serverAddress+'/media/square_thumbnails/'+cell.image_hash+'.jpg'}/>
                                    )
                                }





                                <div style={{left:5,top:5,position:'absolute'}}>
                                    <Icon 
                                        style={{backgroundColor:'white'}}
                                        circular
                                        onClick={()=>{
                                            this.onPhotoSelect(cell.image_hash)
                                        }}
                                        name={this.state.selectedImageHashes.includes(cell.image_hash) ? 'checkmark' : '' }
                                        color={this.state.selectedImageHashes.includes(cell.image_hash) ? 'blue' : 'grey' }/>
                                </div>
                                { hiddenIcon }
								{ favIcon }
                            </div>
                        )
                    } else { // normal mode


	
                        return (
                            <div className="gridCell" key={key} style={style}>

                               { this.props.photos[cell.image_hash] && this.props.photos[cell.image_hash].hidden ? 
                                    (
                                        <div style={{
                                            height:this.state.entrySquareSize-2,
                                            width:this.state.entrySquareSize-2,
                                            padding:0,
                                            backgroundColor:'#dddddd'}}>
                                        </div>
                                    ) :
                                    (
                                        <Image key={'daygroup_image_'+cell.image_hash} style={{display:'inline-block',padding:1,margin:0}}
                                        onClick={()=>{
                                            this.onPhotoClick(cell.image_hash)
                                        }}
                                        height={this.state.entrySquareSize} 
                                        width={this.state.entrySquareSize} 
                                        src={serverAddress+'/media/square_thumbnails/'+cell.image_hash+'.jpg'}/>
                                    )
                                }

                                <div className='gridCellActions' style={{left:6,top:6,position:'absolute'}}>
                                    <Icon 
                                        style={{backgroundColor:'white'}}
                                        circular
                                        onClick={()=>{
                                            this.onPhotoSelect(cell.image_hash)
                                            this.setState({selectMode:true})
                                        }}
                                        name='checkmark'
                                        color={this.state.selectedImageHashes.includes(cell.image_hash) ? 'blue' : 'grey' }/>
                                </div>
                                { hiddenIcon }
								{ favIcon }
                            </div>                                
                        )
                    }
                } else {
                    return (
                        <div key={key} style={{...style,
                            width:this.state.entrySquareSize-2,
                            height:this.state.entrySquareSize-2,
                            backgroundColor: this.state.selectedImageHashes.includes(cell.image_hash) ? '#AED6F1' : '#eeeeee'}}>
                        </div>                                
                    )
                }

            }

        } else { // empty cell
            return (
                <div key={key} style={style}>
                </div>
            )
        }
    }





    
    getPhotoDetails(image_hash) {
        this.props.dispatch(fetchPhotoDetail(image_hash))
    }


    static getDerivedStateFromProps(nextProps,prevState){
        const shouldUpdateStates = !_.isEqualWith(nextProps.photos,prevState.photos)
        console.log(shouldUpdateStates)
        if (shouldUpdateStates) {
            var t0 = performance.now();
            const photos = nextProps.photos
            const imagesGroupedByDate = _.toPairs(
                _.groupBy(
                    _.orderBy(
                        _.map(nextProps.photos,(el)=>el).filter((el)=> el.exif_timestamp && !el.hidden ? true : false),
                        ['exif_timestamp'],['desc']),
                    (el)=>moment(el.exif_timestamp).format('YYYY-MM-DD'))
            ).map((el)=>{
                return (
                    {date:el[0],photos:el[1],location:null}
                )
            })
            var t1 = performance.now();
                    console.log("grouping photos into dates took " + (t1 - t0) + " milliseconds.")
    
            var idx2hash = [] 
            imagesGroupedByDate.forEach((day)=>{
                day.photos.forEach((photo)=>{
                    idx2hash.push(photo.image_hash)
                })
            })
            const {cellContents,hash2row} = calculateGridCells(imagesGroupedByDate,prevState.numEntrySquaresPerRow)
            const nextState = {...prevState,cellContents,hash2row,imagesGroupedByDate,idx2hash,photos}
            console.log(nextState)
            return nextState
        } else {
            return prevState
        }
        
    }


    render() {
        const {lightboxImageIndex} = this.state
        if ( this.state.idx2hash.length < 1 ||this.state.imagesGroupedByDate.length < 1) {
            return (
				<div>
					<Loader active indeterminate>
						<b>Loading photos...</b><br/>
						If there are uncached changes in the database, this might take a while.
					</Loader>
				</div>
			)
        }
        var totalListHeight = this.state.cellContents.map((row,index)=>{
            if (row[0].date) { //header row
                return DAY_HEADER_HEIGHT
            } else { //photo row
                return this.state.entrySquareSize
            }
        }).reduce((a,b)=>(a+b),0)
        return (
            <div>
                <div style={{height:60,paddingTop:10}}>

                  <Header as='h2'>
                    <Icon name='picture' />
                    <Header.Content>
                      All Photos
                      <Header.Subheader>
                        {this.state.imagesGroupedByDate.length} Days, {this.state.idx2hash.length} Photos
                      </Header.Subheader>
                    </Header.Content>
                  </Header>
                </div>


                { this.state.selectMode && (
                    <div style={{marginLeft:-5,paddingLeft:5,paddingRight:5,height:40,paddingTop:4,backgroundColor:'#AED6F1'}}>

                        <Button
                            compact
                            active={this.state.selectMode ? true : false}
                            color={this.state.selectMode ? 'red' : 'grey'}
                            onClick={()=>{
                                if (this.state.selectMode) { // reset selected photos when exiting select mode
                                    this.setState({
                                        selectedImageHashes:[],
                                        selectMode:!this.state.selectMode
                                    })
                                } else {
                                    this.setState({selectMode:!this.state.selectMode})
                                }
                            }}>
                            <Icon name='close'/> Deselect All
                        </Button>

                        <Button.Group compact floated='right'>
                        <Popup inverted trigger={
                            <Button color='green' onClick={()=>{
                                if (this.state.selectedImageHashes.length > 0) {
                                    this.setState({modalAddToAlbumOpen:true})
                                }
                            }} icon='plus'/>}
                            content="Add to an existing album or create a new album"/>        
                        <Popup inverted trigger={
                            <Button color='yellow' onClick={()=>{
                                this.props.dispatch(setPhotosFavorite(this.state.selectedImageHashes,true))
                            }}><Icon.Group><Icon name='star'/><Icon corner color='green' name='plus'/></Icon.Group></Button>}
                            content="Mark as favorite"/>        
                        <Popup inverted trigger={
                            <Button color='orange' onClick={()=>{
                                this.props.dispatch(setPhotosFavorite(this.state.selectedImageHashes,false))
                            }}><Icon.Group><Icon name='star'/><Icon corner color='red' name='minus'/></Icon.Group></Button>}
                            content="Remove from favorites"/>        
                        <Popup inverted trigger={
                            <Button color='grey' icon='hide' onClick={()=>{
                                this.props.dispatch(setPhotosHidden(this.state.selectedImageHashes,true))
                            }}/>}
                            content="Hide"/>        

                        </Button.Group>

                        <Label basic>
                        {this.state.selectedImageHashes.length} selected
                        </Label>
                    </div>
                )}

                <AutoSizer disableHeight style={{outline:'none',padding:0,margin:0}}>
                  {({width}) => (
                    <Grid
                      ref={this.listRef}
                      onSectionRendered={({rowStartIndex})=>{
                        var date = this.state.cellContents[rowStartIndex][0].date
                        if (date) {
                            if (date=='No Timestamp') {
                                this.setState({
                                    date:date,
                                    fromNow:date
                                })
                            } else {
                                this.setState({
                                    date:moment(date).format("MMMM Do YYYY"),
                                    fromNow:moment(date).fromNow()
                                })
                            }
                        }
                      }}
                      overscanRowCount={5}
                      style={{outline:'none'}}
                      cellRenderer={this.cellRenderer}
                      onScroll={this.handleScroll}
                      columnWidth={this.state.entrySquareSize}
                      columnCount={this.state.numEntrySquaresPerRow}
                      height={this.state.selectMode ? this.state.height- topMenuHeight - 60 - 40 : this.state.height- topMenuHeight - 60}
                      estimatedRowSize={totalListHeight/this.state.cellContents.length.toFixed(1)}
                      rowHeight={({index})=> {
                        if (this.state.cellContents[index][0].date) { //header row
                            return DAY_HEADER_HEIGHT
                        } else { //photo row
                            return this.state.entrySquareSize
                        }
                      }}
                      rowCount={this.state.cellContents.length}
                      width={width}
                    />
                  )}
                </AutoSizer>

            { this.state.cellContents[this.state.currTopRenderedRowIdx][0] && (
                <div style={{
                    right:0,
                    top:topMenuHeight + 10+ (0 / totalListHeight) * (this.state.height - topMenuHeight - 50 - 20),
                    position:'fixed',
                    float:'left',
                    width:180,
                    padding:0,
                    height:50,
                    zIndex:100,
                }}>
                    <div style={{textAlign:'right',paddingRight:30}} className='handle'>
                        <b>{this.state.date}</b> <br/>
                    </div>
                    <div style={{textAlign:'right',paddingRight:30}}>
                        {this.state.fromNow}
                    </div>
                </div>
            )}

                <div style={{
                    backgroundColor:'white',
                    position:'fixed',
                    right:0,
                    top:topMenuHeight,
                    height:this.state.height-topMenuHeight,
                    width:timelineScrollWidth}}>
                        
                </div>

                { this.state.lightboxShow &&
                    <LightBox
                        idx2hash={this.state.idx2hash}
                        lightboxImageIndex={this.state.lightboxImageIndex}

                        onCloseRequest={() => this.setState({ lightboxShow: false })}
                        onImageLoad={()=>{
                            this.getPhotoDetails(this.state.idx2hash[this.state.lightboxImageIndex])
                        }}
                        onMovePrevRequest={() => {
                            var prevIndex = (this.state.lightboxImageIndex + this.state.idx2hash.length - 1) % this.state.idx2hash.length
                            this.setState({
                                lightboxImageIndex:prevIndex
                            })
                            var rowIdx = this.state.hash2row[this.state.idx2hash[prevIndex]]
                            this.listRef.current.scrollToCell({columnIndex:0,rowIndex:rowIdx})
                            this.getPhotoDetails(this.state.idx2hash[prevIndex])
                        }}
                        onMoveNextRequest={() => {
                            var nextIndex = (this.state.lightboxImageIndex + this.state.idx2hash.length + 1) % this.state.idx2hash.length
                            this.setState({
                                lightboxImageIndex:nextIndex
                            })
                            var rowIdx = this.state.hash2row[this.state.idx2hash[nextIndex]]
                            this.listRef.current.scrollToCell({columnIndex:0,rowIndex:rowIdx})
                            this.getPhotoDetails(this.state.idx2hash[nextIndex])
                        }}/>
                }

                <ModalAlbumEdit 
                    isOpen={this.state.modalAddToAlbumOpen}
                    onRequestClose={()=>{
                        this.setState({
                            modalAddToAlbumOpen:false})
                    }}
                    selectedImageHashes={this.state.selectedImageHashes}/>

            </div>
        )
    }
}

class ModalAlbumEdit extends Component {
    state = {newAlbumTitle:''}
    render() {
        return (
            <Modal
                ariaHideApp={false}
                onAfterOpen={()=>{this.props.dispatch(fetchUserAlbumsList())}}
                isOpen={this.props.isOpen}
                onRequestClose={()=>{
                    this.props.onRequestClose()
                    this.setState({newAlbumTitle:''})
                }}
                style={customStyles}>

                <div style={{height:50,width:'100%',padding:7}}>
                <Header>
                    Add to Album
                    <Header.Subheader>
                        Add selected {this.props.selectedImageHashes.length} item(s) to...
                    </Header.Subheader>
                </Header>
                </div>
                <Divider fitted/>
                <div style={{paddingLeft:10,paddingTop:10,overflowY:'scroll',height:window.innerHeight-300-50,width:'100%'}}>
                    <Item.Group verticalAlign='middle'>
                        <Item>
                            <Item.Content style={{paddingRight:10}}>
                                <Item.Header as='h4'>
                                    New album
                                </Item.Header>
                                <Item.Description>
                                    <Popup 
                                        inverted
                                        content={'Album "'+this.state.newAlbumTitle.trim()+'" already exists.'}
                                        position='bottom center'
                                        open={this.props.albumsUserList.map((el)=>el.title.toLowerCase().trim()).includes(this.state.newAlbumTitle.toLowerCase().trim())}
                                        trigger={
                                            <Input 
                                                fluid
                                                error={
                                                    this.props.albumsUserList.map((el)=>el.title.toLowerCase().trim()).includes(this.state.newAlbumTitle.toLowerCase().trim())
                                                }
                                                onChange={(e,v)=>{
                                                    this.setState({newAlbumTitle:v.value})
                                                }}
                                                placeholder='Album title' action>
                                                <input/>
                                                <Button 
                                                    onClick={()=>{
                                                        this.props.dispatch(createNewUserAlbum(this.state.newAlbumTitle,this.props.selectedImageHashes))
                                                        this.props.onRequestClose()
                                                        this.setState({newAlbumTitle:''})
                                                    }}
                                                    disabled={this.props.albumsUserList.map((el)=>el.title.toLowerCase().trim()).includes(this.state.newAlbumTitle.toLowerCase().trim())}
                                                    type='submit'>
                                                    Create
                                                </Button>
                                            </Input>
                                        }/>
                                </Item.Description>
                            </Item.Content>
                        </Item>
                        <Divider />
                        {
                            this.props.albumsUserList.map((item)=>{
                                return (
                                    <Item>
                                        <Item.Image size='tiny' src={
                                            item.photos[0] ? 
                                            (serverAddress+'/media/square_thumbnails_small/'+item.photos[0].image_hash+'.jpg') :
                                            ('/thumbnail_placeholder.png')
                                        }/>
                                        <Item.Content>
                                            <Item.Header 
                                                onClick={()=>{
                                                    this.props.dispatch(editUserAlbum(item.id,item.title,this.props.selectedImageHashes))
                                                    this.props.onRequestClose()
                                                    // console.log('trying to add photos: ',this.props.selectedImageHashes)
                                                    // console.log('to user album id: ',item.id)
                                                }}
                                                as='a'>
                                                {item.title}
                                            </Item.Header>
                                            <Item.Meta>{item.photos.length} Item(s) </Item.Meta>
                                            <Item.Description>
                                                {"Updated " + moment(item.created_on).fromNow()}
                                            </Item.Description>
                                        </Item.Content>
                                    </Item>
                                )
                            })
                        }
                    </Item.Group>
                </div>
            </Modal>
        )
    }
}


ModalAlbumEdit = connect((store)=>{
    return {
        albumsUserList: store.albums.albumsUserList,
        fetchingAlbumsUserList: store.albums.fetchingAlbumsUserList,
        fetchedAlbumsUserList: store.albums.fetchedAlbumsUserList,
    }
  })(ModalAlbumEdit)
  

AllPhotosHashListViewRV = connect((store)=>{
  return {
    photos: store.photos.photos,
    fetchingPhotos: store.photos.fetchingPhotos,
    fetchedPhotos: store.photos.fetchedPhotos,

    photoDetails: store.photos.photoDetails,
    fetchingPhotoDetail: store.photos.fetchingPhotoDetail,
    fetchedPhotoDetail: store.photos.fetchedPhotoDetail,

    idx2hash: store.albums.idx2hash,

    albumsDatePhotoHashList: store.albums.albumsDatePhotoHashList,
    fetchingAlbumsDatePhotoHashList: store.albums.fetchingAlbumsDatePhotoHashList,
    fetchedAlbumsDatePhotoHashList: store.albums.fetchedAlbumsDatePhotoHashList,    
  }
})(AllPhotosHashListViewRV)
