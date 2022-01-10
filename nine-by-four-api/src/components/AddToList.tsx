import React from 'react';



const AddToList = () => {
    return (
        <div className='AddToList'>
            <input 
                type="text"
                placeholder='Name'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Stage Name'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Age'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Home'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Record Label'
                className='AddToList-input'            
            />
        </div>
    )
}


export default AddToList;